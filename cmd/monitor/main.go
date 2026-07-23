package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"daj/internal/app"
)

//go:embed web/dist
var frontend embed.FS

func main() {
	addr := getenv("MONITOR_ADDR", "127.0.0.1:8080")
	dataDir := getenv("MONITOR_DATA_DIR", "data")
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		log.Fatalf("create data directory: %v", err)
	}

	store, err := app.NewStore(filepath.Join(dataDir, "monitor.db"), filepath.Join(dataDir, "master.key"))
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer store.Close()

	monitor := app.NewMonitor(store)
	monitor.Start()
	defer monitor.Stop()

	webFS, err := fs.Sub(frontend, "web/dist")
	if err != nil {
		log.Fatalf("load embedded frontend: %v", err)
	}

	server := &http.Server{
		Addr:              addr,
		Handler:           app.NewHandler(store, monitor, webFS),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("OpenAI / Claude monitor listening on http://localhost%s", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
}

func getenv(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
