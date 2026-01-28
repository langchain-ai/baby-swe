declare global {
  interface Window {
    versions: {
      node: () => string;
      chrome: () => string;
      electron: () => string;
    };
  }
}

const info = document.getElementById('info');
if (info) {
  info.innerHTML = `
    Node: ${window.versions.node()}<br>
    Chrome: ${window.versions.chrome()}<br>
    Electron: ${window.versions.electron()}
  `;
}

export {};
