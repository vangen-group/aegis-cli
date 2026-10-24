package cmd

import (
	"github.com/spf13/cobra"
)

var helpCmd = &cobra.Command{
	Use:   "help [command]",
	Short: "Help about any command",
	RunE: func(cmd *cobra.Command, args []string) error {
		return rootCmd.Help()
	},
}
