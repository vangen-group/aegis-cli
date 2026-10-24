package update

import (
	"fmt"
	"time"

	"github.com/schollz/progressbar/v3"
)

// InstallBundle installs the latest signed configuration bundle
func InstallBundle(bar *progressbar.ProgressBar) error {
	steps := 10
	for i := 0; i <= steps; i++ {
		bar.Set(i * (100 / steps))
		time.Sleep(100 * time.Millisecond) // Simulate work
	}
	bar.Set(100)
	return nil
}

// UpdateCLI updates the CLI next to the running one
func UpdateCLI(bar *progressbar.ProgressBar) error {
	steps := 8
	for i := 0; i <= steps; i++ {
		bar.Set(i * (100 / steps))
		time.Sleep(80 * time.Millisecond) // Simulate work
	}
	bar.Set(100)
	return nil
}

// StartNewVersion starts the new Aegis version
func StartNewVersion(bar *progressbar.ProgressBar) error {
	steps := 15 // More steps for pulling and verifying
	for i := 0; i <= steps; i++ {
		bar.Set(i * (100 / steps))
		time.Sleep(120 * time.Millisecond) // Simulate work
	}
	bar.Set(100)
	return nil
}

// CleanupOldImages removes previous base and developer images
func CleanupOldImages(bar *progressbar.ProgressBar) error {
	steps := 5
	for i := 0; i <= steps; i++ {
		bar.Set(i * (100 / steps))
		time.Sleep(60 * time.Millisecond) // Simulate work
	}
	bar.Set(100)
	return nil
}

// Version returns the current Aegis version
func Version() string {
	return "0.1.0"
}
