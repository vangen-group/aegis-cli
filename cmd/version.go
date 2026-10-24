package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the Aegis version",
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("aegis version 0.1.0")
		return nil
	},
}
