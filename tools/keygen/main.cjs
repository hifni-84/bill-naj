const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 520,
    height: 760,
    resizable: false,
    autoHideMenuBar: true,
    title: "NAJWA_BILLING Keygen",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, "keygen.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
