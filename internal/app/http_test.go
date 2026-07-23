package app

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func TestHandlerServesEmptyAPIAndFrontend(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "test.db"), filepath.Join(dir, "key"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	web := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<!doctype html><title>test</title>")},
	}
	server := httptest.NewServer(NewHandler(store, NewMonitor(store), web))
	defer server.Close()

	response, err := http.Get(server.URL + "/api/channels")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var channels []Channel
	if err := json.NewDecoder(response.Body).Decode(&channels); err != nil {
		t.Fatal(err)
	}
	if channels == nil || len(channels) != 0 {
		t.Fatalf("channels = %#v, want empty array", channels)
	}

	indexResponse, err := http.Get(server.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer indexResponse.Body.Close()
	index, err := io.ReadAll(indexResponse.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(index) != "<!doctype html><title>test</title>" {
		t.Fatalf("unexpected frontend response: %q", index)
	}
}
