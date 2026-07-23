package app

import "time"

type Channel struct {
	ID            int64      `json:"id"`
	Name          string     `json:"name"`
	Provider      string     `json:"provider"`
	BaseURL       string     `json:"baseUrl"`
	Model         string     `json:"model"`
	Enabled       bool       `json:"enabled"`
	APIKeySet     bool       `json:"apiKeySet"`
	Note          string     `json:"note"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
	LastProbe     *ProbeView `json:"lastProbe,omitempty"`
	Availability  float64    `json:"availability"`
	ProbeCount24h int        `json:"probeCount24h"`
}

type ChannelInput struct {
	Name     string `json:"name"`
	Provider string `json:"provider"`
	BaseURL  string `json:"baseUrl"`
	APIKey   string `json:"apiKey"`
	Model    string `json:"model"`
	Enabled  bool   `json:"enabled"`
	Note     string `json:"note"`
}

type ProbeView struct {
	ID              int64     `json:"id"`
	ChannelID       int64     `json:"channelId"`
	Success         bool      `json:"success"`
	StatusCode      int       `json:"statusCode"`
	LatencyMs       int64     `json:"latencyMs"`
	Error           string    `json:"error"`
	ResponseExcerpt string    `json:"responseExcerpt"`
	CheckedAt       time.Time `json:"checkedAt"`
}

type Summary struct {
	TotalChannels      int        `json:"totalChannels"`
	EnabledChannels    int        `json:"enabledChannels"`
	HealthyChannels    int        `json:"healthyChannels"`
	RecentAvailability float64    `json:"recentAvailability"`
	AverageLatencyMs   float64    `json:"averageLatencyMs"`
	LastProbeAt        *time.Time `json:"lastProbeAt,omitempty"`
}

type SeriesPoint struct {
	Bucket       time.Time `json:"bucket"`
	SuccessRate  float64   `json:"successRate"`
	AvgLatencyMs float64   `json:"avgLatencyMs"`
	ProbeCount   int       `json:"probeCount"`
}
