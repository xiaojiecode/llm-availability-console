package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProbeChannel(t *testing.T) {
	tests := []struct {
		name       string
		provider   string
		baseSuffix string
		wantPath   string
		wantHeader string
	}{
		{name: "openai", provider: "openai", baseSuffix: "", wantPath: "/v1/chat/completions", wantHeader: "Authorization"},
		{name: "openai with v1 base", provider: "openai", baseSuffix: "/v1", wantPath: "/v1/chat/completions", wantHeader: "Authorization"},
		{name: "anthropic", provider: "anthropic", baseSuffix: "", wantPath: "/v1/messages", wantHeader: "X-Api-Key"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != test.wantPath {
					t.Errorf("path = %q, want %q", r.URL.Path, test.wantPath)
				}
				if r.Header.Get(test.wantHeader) == "" {
					t.Errorf("missing %s header", test.wantHeader)
				}
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Fatal(err)
				}
				if body["max_tokens"] != float64(1) {
					t.Errorf("max_tokens = %v, want 1", body["max_tokens"])
				}
				w.Header().Set("content-type", "application/json")
				_, _ = w.Write([]byte("{\"ok\":true}"))
			}))
			defer server.Close()

			outcome := probeChannel(context.Background(), Channel{
				Provider: test.provider,
				BaseURL:  server.URL + test.baseSuffix,
				Model:    "test-model",
			}, "test-key")
			if !outcome.Success {
				t.Fatalf("probe failed: %s", outcome.Error)
			}
			if outcome.StatusCode != http.StatusOK {
				t.Fatalf("status = %d", outcome.StatusCode)
			}
		})
	}
}
