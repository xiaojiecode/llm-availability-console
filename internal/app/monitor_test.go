package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestMonitorRunAllProbesConcurrently(t *testing.T) {
	const channelCount = 6

	var started atomic.Int32
	var releaseOnce sync.Once
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if started.Add(1) == channelCount {
			releaseOnce.Do(func() { close(release) })
		}
		select {
		case <-release:
			w.Header().Set("content-type", "application/json")
			_, _ = w.Write([]byte(`{"ok":true}`))
		case <-time.After(2 * time.Second):
			http.Error(w, "probes did not start concurrently", http.StatusGatewayTimeout)
		}
	}))
	defer server.Close()

	tempDir := t.TempDir()
	store, err := NewStore(filepath.Join(tempDir, "monitor.db"), filepath.Join(tempDir, "master.key"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	ctx := context.Background()
	for index := 0; index < channelCount; index++ {
		_, err := store.SaveChannel(ctx, 0, ChannelInput{
			Name:     "channel-" + string(rune('a'+index)),
			Provider: "openai",
			BaseURL:  server.URL,
			APIKey:   "test-key",
			Model:    "test-model",
			Enabled:  true,
		})
		if err != nil {
			t.Fatal(err)
		}
	}

	startedAt := time.Now()
	NewMonitor(store).runAll()
	elapsed := time.Since(startedAt)

	if got := int(started.Load()); got != channelCount {
		t.Fatalf("started probes = %d, want %d", got, channelCount)
	}
	if elapsed >= 1500*time.Millisecond {
		t.Fatalf("concurrent batch took %s", elapsed)
	}

	probes, err := store.RecentProbes(ctx, channelCount)
	if err != nil {
		t.Fatal(err)
	}
	if len(probes) != channelCount {
		t.Fatalf("saved probes = %d, want %d", len(probes), channelCount)
	}
}
