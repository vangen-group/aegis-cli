package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "aegis",
	Short: "Aegis CLI - Hermetic dev workstation for supervised AI agents",
	Long: `Aegis provides a secure, isolated development environment for AI agents.
It manages workstations, sandboxes, and secure secrets handling.`,
	Version: "0.1.0",
}

func Execute() error {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return err
	}
	return nil
}

func init() {
	rootCmd.AddCommand(updateCmd)
	rootCmd.AddCommand(versionCmd)
	rootCmd.AddCommand(helpCmd)
}
