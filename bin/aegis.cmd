@echo off
rem aegis.cmd -- thin wrapper for cmd.exe. Contains NO logic of its own: it
rem only hands off to the bash script (the single source of truth) via Git
rem Bash's bash.exe. See docs/11-aegis-cli.md.
"C:\Program Files\Git\bin\bash.exe" "%~dp0aegis" %*
exit /b %ERRORLEVEL%
