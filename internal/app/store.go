package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db  *sql.DB
	box *secretBox
}

func NewStore(dbPath, keyPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if _, err := db.Exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;"); err != nil {
		_ = db.Close()
		return nil, err
	}
	box, err := newSecretBox(keyPath)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	store := &Store{db: db, box: box}
	if err := store.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS channels (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			provider TEXT NOT NULL CHECK(provider IN ('openai', 'anthropic')),
			base_url TEXT NOT NULL,
			api_key_enc TEXT NOT NULL,
			model TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1,
			note TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS probes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
			success INTEGER NOT NULL,
			status_code INTEGER NOT NULL DEFAULT 0,
			latency_ms INTEGER NOT NULL DEFAULT 0,
			error TEXT NOT NULL DEFAULT '',
			response_excerpt TEXT NOT NULL DEFAULT '',
			checked_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_probes_channel_time ON probes(channel_id, checked_at DESC);
		CREATE INDEX IF NOT EXISTS idx_probes_time ON probes(checked_at DESC);
	`)
	return err
}

func (s *Store) ListChannels(ctx context.Context) ([]Channel, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, provider, base_url, model, enabled, note, created_at, updated_at
		FROM channels ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	channels := make([]Channel, 0)
	for rows.Next() {
		var c Channel
		var enabled int
		var createdAt, updatedAt string
		if err := rows.Scan(&c.ID, &c.Name, &c.Provider, &c.BaseURL, &c.Model, &enabled, &c.Note, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		c.Enabled = enabled == 1
		c.CreatedAt, _ = time.Parse(time.RFC3339Nano, createdAt)
		c.UpdatedAt, _ = time.Parse(time.RFC3339Nano, updatedAt)
		channels = append(channels, c)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for index := range channels {
		var encrypted string
		if err := s.db.QueryRowContext(ctx, "SELECT api_key_enc FROM channels WHERE id = ?", channels[index].ID).Scan(&encrypted); err == nil {
			channels[index].APIKeySet = encrypted != ""
		}
		if err := s.fillChannelStats(ctx, &channels[index]); err != nil {
			return nil, err
		}
	}
	return channels, nil
}

func (s *Store) fillChannelStats(ctx context.Context, c *Channel) error {
	var latest ProbeView
	var checked string
	var success int
	err := s.db.QueryRowContext(ctx, `
		SELECT id, channel_id, success, status_code, latency_ms, error, response_excerpt, checked_at
		FROM probes WHERE channel_id = ? ORDER BY checked_at DESC LIMIT 1
	`, c.ID).Scan(&latest.ID, &latest.ChannelID, &success, &latest.StatusCode, &latest.LatencyMs, &latest.Error, &latest.ResponseExcerpt, &checked)
	if err == nil {
		latest.Success = success == 1
		latest.CheckedAt, _ = time.Parse(time.RFC3339Nano, checked)
		c.LastProbe = &latest
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	since := time.Now().UTC().Add(-24 * time.Hour).Format(time.RFC3339Nano)
	var total, successCount int
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*), COALESCE(SUM(success), 0) FROM probes WHERE channel_id = ? AND checked_at >= ?", c.ID, since).Scan(&total, &successCount); err != nil {
		return err
	}
	c.ProbeCount24h = total
	if total > 0 {
		c.Availability = math.Round(float64(successCount)/float64(total)*1000) / 10
	}
	return nil
}

func (s *Store) GetChannel(ctx context.Context, id int64) (Channel, string, error) {
	var c Channel
	var enabled int
	var encrypted, createdAt, updatedAt string
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, provider, base_url, api_key_enc, model, enabled, note, created_at, updated_at
		FROM channels WHERE id = ?
	`, id).Scan(&c.ID, &c.Name, &c.Provider, &c.BaseURL, &encrypted, &c.Model, &enabled, &c.Note, &createdAt, &updatedAt)
	if err != nil {
		return c, "", err
	}
	c.Enabled = enabled == 1
	c.APIKeySet = encrypted != ""
	c.CreatedAt, _ = time.Parse(time.RFC3339Nano, createdAt)
	c.UpdatedAt, _ = time.Parse(time.RFC3339Nano, updatedAt)
	key, err := s.box.open(encrypted)
	return c, key, err
}

func (s *Store) SaveChannel(ctx context.Context, id int64, input ChannelInput) (Channel, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.Provider = strings.TrimSpace(strings.ToLower(input.Provider))
	input.BaseURL = strings.TrimRight(strings.TrimSpace(input.BaseURL), "/")
	input.Model = strings.TrimSpace(input.Model)
	if input.Name == "" || input.BaseURL == "" || input.Model == "" {
		return Channel{}, fmt.Errorf("name, baseUrl and model are required")
	}
	if input.Provider != "openai" && input.Provider != "anthropic" {
		return Channel{}, fmt.Errorf("provider must be openai or anthropic")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if id == 0 {
		if input.APIKey == "" {
			return Channel{}, fmt.Errorf("apiKey is required for a new channel")
		}
		encrypted, err := s.box.seal(input.APIKey)
		if err != nil {
			return Channel{}, err
		}
		result, err := s.db.ExecContext(ctx, `
			INSERT INTO channels(name, provider, base_url, api_key_enc, model, enabled, note, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, input.Name, input.Provider, input.BaseURL, encrypted, input.Model, boolInt(input.Enabled), input.Note, now, now)
		if err != nil {
			return Channel{}, err
		}
		id, err = result.LastInsertId()
		if err != nil {
			return Channel{}, err
		}
	} else {
		var apiKeyEnc string
		if input.APIKey != "" {
			apiKeyEnc, _ = s.box.seal(input.APIKey)
		} else if err := s.db.QueryRowContext(ctx, "SELECT api_key_enc FROM channels WHERE id = ?", id).Scan(&apiKeyEnc); err != nil {
			return Channel{}, err
		}
		result, err := s.db.ExecContext(ctx, `
			UPDATE channels SET name = ?, provider = ?, base_url = ?, api_key_enc = ?, model = ?, enabled = ?, note = ?, updated_at = ?
			WHERE id = ?
		`, input.Name, input.Provider, input.BaseURL, apiKeyEnc, input.Model, boolInt(input.Enabled), input.Note, now, id)
		if err != nil {
			return Channel{}, err
		}
		if affected, _ := result.RowsAffected(); affected == 0 {
			return Channel{}, sql.ErrNoRows
		}
	}
	channel, _, err := s.GetChannel(ctx, id)
	return channel, err
}

func (s *Store) DeleteChannel(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM channels WHERE id = ?", id)
	return err
}

func (s *Store) SaveProbe(ctx context.Context, probe ProbeView) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO probes(channel_id, success, status_code, latency_ms, error, response_excerpt, checked_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, probe.ChannelID, boolInt(probe.Success), probe.StatusCode, probe.LatencyMs, probe.Error, probe.ResponseExcerpt, probe.CheckedAt.UTC().Format(time.RFC3339Nano))
	return err
}

func (s *Store) RecentProbes(ctx context.Context, limit int) ([]ProbeView, error) {
	if limit < 1 || limit > 500 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT p.id, p.channel_id, p.success, p.status_code, p.latency_ms, p.error, p.response_excerpt, p.checked_at
		FROM probes p ORDER BY p.checked_at DESC LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]ProbeView, 0)
	for rows.Next() {
		var p ProbeView
		var checked string
		var success int
		if err := rows.Scan(&p.ID, &p.ChannelID, &success, &p.StatusCode, &p.LatencyMs, &p.Error, &p.ResponseExcerpt, &checked); err != nil {
			return nil, err
		}
		p.Success = success == 1
		p.CheckedAt, _ = time.Parse(time.RFC3339Nano, checked)
		items = append(items, p)
	}
	return items, rows.Err()
}

func (s *Store) Summary(ctx context.Context) (Summary, error) {
	var summary Summary
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*), COALESCE(SUM(enabled), 0) FROM channels").Scan(&summary.TotalChannels, &summary.EnabledChannels); err != nil {
		return summary, err
	}
	if err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(CASE WHEN p.success = 1 THEN 1 ELSE 0 END), 0)
		FROM channels c JOIN probes p ON p.id = (
			SELECT p2.id FROM probes p2 WHERE p2.channel_id = c.id ORDER BY p2.checked_at DESC LIMIT 1
		) WHERE c.enabled = 1
	`).Scan(&summary.HealthyChannels); err != nil {
		return summary, err
	}
	since := time.Now().UTC().Add(-24 * time.Hour).Format(time.RFC3339Nano)
	var total, success int
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*), COALESCE(SUM(success), 0) FROM probes WHERE checked_at >= ?", since).Scan(&total, &success); err != nil {
		return summary, err
	}
	if total > 0 {
		summary.RecentAvailability = math.Round(float64(success)/float64(total)*1000) / 10
	}
	if err := s.db.QueryRowContext(ctx, "SELECT COALESCE(AVG(latency_ms), 0) FROM probes WHERE checked_at >= ? AND success = 1", since).Scan(&summary.AverageLatencyMs); err != nil {
		return summary, err
	}
	var last string
	if err := s.db.QueryRowContext(ctx, "SELECT checked_at FROM probes ORDER BY checked_at DESC LIMIT 1").Scan(&last); err == nil {
		value, _ := time.Parse(time.RFC3339Nano, last)
		summary.LastProbeAt = &value
	}
	return summary, nil
}

func (s *Store) Series(ctx context.Context, channelID int64, window time.Duration) ([]SeriesPoint, error) {
	since := time.Now().UTC().Add(-window)
	args := []any{since.Format(time.RFC3339Nano)}
	where := "checked_at >= ?"
	if channelID > 0 {
		where += " AND channel_id = ?"
		args = append(args, channelID)
	}
	rows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT strftime('%%Y-%%m-%%dT%%H:%%M:00Z', checked_at) AS bucket,
			COALESCE(AVG(CASE WHEN success = 1 THEN 100.0 ELSE 0.0 END), 0),
			COALESCE(AVG(CASE WHEN success = 1 THEN latency_ms ELSE NULL END), 0),
			COUNT(*)
		FROM probes WHERE %s GROUP BY bucket ORDER BY bucket ASC
	`, where), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	points := make([]SeriesPoint, 0)
	for rows.Next() {
		var p SeriesPoint
		var bucket string
		if err := rows.Scan(&bucket, &p.SuccessRate, &p.AvgLatencyMs, &p.ProbeCount); err != nil {
			return nil, err
		}
		p.Bucket, _ = time.Parse(time.RFC3339, bucket)
		points = append(points, p)
	}
	return points, rows.Err()
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
