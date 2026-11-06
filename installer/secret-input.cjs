'use strict';
// Masked passphrase input for the provisioning dialog (provision.cjs).
// Shows one '*' per typed character on the console (stderr) and writes the
// passphrase to stdout, which the dialog shell captures — it never reaches
// the wizard server. Runs as the user, as the terminal's foreground job.
//   node secret-input.cjs '<prompt>'
// Exit: 0 = line read, 130 = Ctrl+C, 1 = Ctrl+D on an empty line, 2 = no TTY.
const prompt = process.argv[2] || '';
const input = process.stdin;
const echo = process.stderr;
if (!input.isTTY) process.exit(2);

let value = [];
const finish = (code) => {
    input.setRawMode(false);
    echo.write('\n');
    if (code === 0) process.stdout.write(value.join(''));
    process.exit(code);
};

echo.write(prompt);
input.setRawMode(true);
input.setEncoding('utf8');
input.on('data', (chunk) => {
    // Arrow keys and other escape sequences are not part of a passphrase.
    if (chunk.includes('\u001b')) return;
    for (const ch of chunk) { // iterates code points: 'ñ' is one character
        if (ch === '\r' || ch === '\n') return finish(0);
        if (ch === '\u0003') return finish(130); // Ctrl+C
        if (ch === '\u0004') { if (value.length === 0) return finish(1); continue; } // Ctrl+D
        if (ch === '\u007f' || ch === '\b') { // Backspace
            if (value.length) { value.pop(); echo.write('\b \b'); }
            continue;
        }
        if (ch === '\u0015') { // Ctrl+U clears the line
            echo.write('\b \b'.repeat(value.length));
            value = [];
            continue;
        }
        if (ch < ' ') continue; // other control characters
        value.push(ch);
        echo.write('*');
    }
});
