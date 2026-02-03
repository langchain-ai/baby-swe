export function Logo() {
  const ascii = `
 _           _
| |__   __ _| |__  _   _       _____      _____
| '_ \\ / _\` | '_ \\| | | |_____/ __\\ \\ /\\ / / _ \\
| |_) | (_| | |_) | |_| |_____\\__ \\\\ V  V /  __/
|_.__/ \\__,_|_.__/ \\__, |     |___/ \\_/\\_/ \\___|
                   |___/
`.trim();

  return (
    <pre className="text-[#87CEEB] text-xs leading-none font-mono">
      {ascii}
    </pre>
  );
}
