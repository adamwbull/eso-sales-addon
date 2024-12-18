const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const Store = require('electron-store');
const store = new Store();
const fs = require('fs');
const { execFile } = require('child_process');

// Add these requires for Windows shortcuts
const { spawn } = require('child_process');
const os = require('os');

let mainWindow;
let monitorWindow;

// Add window state persistence
function getWindowState(windowName) {
  const defaultState = {
    main: { width: 630, height: 1020 },
    monitor: { width: 400, height: 300, x: 0, y: 0 }
  };
  
  const state = store.get(`windowState.${windowName}`);
  return state || defaultState[windowName];
}

function saveWindowState(windowName, bounds) {
  store.set(`windowState.${windowName}`, bounds);
}

const createWindow = () => {
  const mainState = getWindowState('main');
  
  mainWindow = new BrowserWindow({
    ...mainState,
    autoHideMenuBar: true,
    menuBarVisible: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    backgroundColor: '#1e1e1e',
    show: false,
    icon: path.join(__dirname, 'assets/icon.png')
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // Save window position when moved or resized
  ['move', 'resize'].forEach(event => {
    mainWindow.on(event, () => {
      if (!mainWindow.isMaximized()) {
        saveWindowState('main', mainWindow.getBounds());
      }
    });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Add this block for development hot reload
  if (process.env.NODE_ENV !== 'production') {
    require('electron-reloader')(module, {
      debug: true,
      watchRenderer: true
    });
  }

  ipcMain.handle('show-open-dialog', (event, options) => {
    return dialog.showOpenDialog(mainWindow, options);
  });
};

const createMonitorWindow = () => {
  const monitorState = getWindowState('monitor');
  
  monitorWindow = new BrowserWindow({
    ...monitorState,
    autoHideMenuBar: true,
    menuBarVisible: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    backgroundColor: '#1e1e1e',
    icon: path.join(__dirname, 'assets/icon.png')
  });

  monitorWindow.loadFile(path.join(__dirname, 'monitor.html'));
  
  // Save window position when moved or resized
  ['move', 'resize'].forEach(event => {
    monitorWindow.on(event, () => {
      if (!monitorWindow.isMaximized()) {
        saveWindowState('monitor', monitorWindow.getBounds());
      }
    });
  });
};

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Add these IPC handlers before the 'launch-game' handler
ipcMain.on('create-desktop-shortcut', () => {
  createDesktopShortcut();
});

ipcMain.on('pin-to-taskbar', () => {
  pinToTaskbar();
});

// Remove the shortcut checks from the launch-game handler
ipcMain.on('launch-game', async (event, settings) => {
  store.set('settings', settings);

  // Launch game based on selected method
  if (settings.steamLaunch) {
    shell.openExternal(settings.steamPath);
  } else if (settings.bethesdaLaunch) {
    try {
      execFile(settings.bethesdaPath);
    } catch (error) {
      console.error('Failed to launch Bethesda launcher:', error);
    }
  }

  // Launch TTC if enabled
  if (settings.useTTC && fs.existsSync(settings.ttcPath)) {
    try {
      execFile(settings.ttcPath);
    } catch (error) {
      console.error('Failed to launch TTC client:', error);
    }
  }

  createMonitorWindow();
  mainWindow.close();
});

// Windows shortcut creation
function createDesktopShortcut() {
  if (process.platform === 'win32') {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const shortcutPath = path.join(desktopPath, 'ESO Sales Launcher.lnk');
    const targetPath = process.execPath;
    
    const powershell = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      `$WS = New-Object -ComObject WScript.Shell; ` +
      `$SC = $WS.CreateShortcut('${shortcutPath}'); ` +
      `$SC.TargetPath = '${targetPath}'; ` +
      `$SC.Save()`
    ]);

    powershell.on('error', (error) => {
      console.error('Failed to create desktop shortcut:', error);
    });
  }
}

function pinToTaskbar() {
  if (process.platform === 'win32') {
    const exePath = process.execPath;
    const shortcutPath = path.join(
      os.homedir(),
      'AppData',
      'Roaming',
      'Microsoft',
      'Internet Explorer',
      'Quick Launch',
      'User Pinned',
      'TaskBar',
      'ESO Sales Launcher.lnk'
    );

    // Create the shortcut first
    const powershell = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      `$WS = New-Object -ComObject WScript.Shell; ` +
      `$SC = $WS.CreateShortcut('${shortcutPath}'); ` +
      `$SC.TargetPath = '${exePath}'; ` +
      `$SC.Save()`
    ]);

    powershell.on('error', (error) => {
      console.error('Failed to create taskbar shortcut:', error);
    });
  }
}

// Add this with your other ipcMain handlers
ipcMain.on('open-folder', (event, folderPath) => {
  // Ensure the folder exists before trying to open it
  if (fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
  } else {
    // Create the folder if it doesn't exist, then open it
    fs.mkdirSync(folderPath, { recursive: true });
    shell.openPath(folderPath);
  }
});

// Add these helper functions
function checkDesktopShortcut() {
  if (process.platform === 'win32') {
    const desktopPath = path.join(os.homedir(), 'Desktop', 'ESO Sales Launcher.lnk');
    return fs.existsSync(desktopPath);
  }
  return false;
}

function checkTaskbarPin() {
  if (process.platform === 'win32') {
    const taskbarPath = path.join(
      os.homedir(),
      'AppData',
      'Roaming',
      'Microsoft',
      'Internet Explorer',
      'Quick Launch',
      'User Pinned',
      'TaskBar',
      'ESO Sales Launcher.lnk'
    );
    return fs.existsSync(taskbarPath);
  }
  return false;
}

// Update these IPC handlers
ipcMain.handle('check-shortcuts', () => {
  return {
    desktopShortcut: checkDesktopShortcut(),
    startPin: checkStartMenuPin()
  };
});

ipcMain.on('pin-to-start', () => {
  addToStartMenu();
});

// Update/add these helper functions
function checkStartMenuPin() {
  if (process.platform === 'win32') {
    const startMenuPath = path.join(
      os.homedir(),
      'AppData',
      'Roaming',
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'ESO Sales Launcher.lnk'
    );
    return fs.existsSync(startMenuPath);
  }
  return false;
}

function addToStartMenu() {
  if (process.platform === 'win32') {
    const startMenuPath = path.join(
      os.homedir(),
      'AppData',
      'Roaming',
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'ESO Sales Launcher.lnk'
    );

    // Create the Programs directory if it doesn't exist
    const programsDir = path.dirname(startMenuPath);
    if (!fs.existsSync(programsDir)) {
      fs.mkdirSync(programsDir, { recursive: true });
    }

    const powershell = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      `$WS = New-Object -ComObject WScript.Shell; ` +
      `$SC = $WS.CreateShortcut('${startMenuPath}'); ` +
      `$SC.TargetPath = '${process.execPath}'; ` +
      `$SC.Save()`
    ]);

    powershell.on('error', (error) => {
      console.error('Failed to create start menu shortcut:', error);
    });
  }
}
