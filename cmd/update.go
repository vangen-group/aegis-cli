package cmd

import (
	"fmt"
	"time"

	"github.com/fatih/color"
	"github.com/schollz/progressbar/v3"
	"github.com/spf13/cobra"

	"github.com/vangen-group/aegis-cli/internal/update"
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update Aegis to the latest version",
	Long: `Update Aegis to the latest signed bundle and image.

The update process:
  1. Installs the latest signed configuration bundle
  2. Updates the CLI next to the running one
  3. Starts the new version (pulls and verifies the base image)
  4. Removes the previous base and developer images`,
	RunE: runUpdate,
}

func runUpdate(cmd *cobra.Command, args []string) error {
	fmt.Println()
	color.Cyan("aegis: updating to the latest version")
	fmt.Println()

	steps := []struct {
		name   string
		action func(*progressbar.ProgressBar) error
	}{
		{"Installing signed bundle", update.InstallBundle},
		{"Updating CLI", update.UpdateCLI},
		{"Starting new version", update.StartNewVersion},
		{"Cleaning up old images", update.CleanupOldImages},
	}

	for i, step := range steps {
		stepNum := i + 1
		fmt.Printf("%d/4 %s\n", stepNum, step.name)

		bar := progressbar.NewOptions(100,
			progressbar.OptionSetWriter(cmd.OutOrStdout()),
			progressbar.OptionSetWidth(40),
			progressbar.OptionShowIts(),
			progressbar.OptionShowElapsedTimeOnFinish(),
			progressbar.OptionUseANSICodes(true),
			progressbar.OptionThrottle(100*time.Millisecond),
			progressbar.OptionSetTheme(progressbar.Theme{
				Saucer:        color.GreenString("━"),
				SaucerHead:    color.GreenString("▶"),
				SaucerPadding: "░",
				BarStart:      "[",
				BarEnd:        "]",
			}),
		)

		if err := step.action(bar); err != nil {
			fmt.Println()
			color.Red("✗ Step %d failed: %v", stepNum, err)
			return fmt.Errorf("update failed at step %d: %w", stepNum, err)
		}

		bar.Close()
		fmt.Println()
	}

	fmt.Println()
	color.Green("✓ Aegis updated successfully")
	color.Cyan("  Your configuration and data are preserved.")
	fmt.Println()
	return nil
}
