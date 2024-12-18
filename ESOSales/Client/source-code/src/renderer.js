const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Store = require('electron-store');
const store = new Store();

const TEST_MODE = true;
// Default paths
const userHome = os.homedir();
const programFilesPaths = {
  x86: process.platform === 'win32' ? 'C:\\Program Files (x86)' : '/usr/local',
  standard: process.platform === 'win32' ? 'C:\\Program Files' : '/usr/local'
};

const steamPath = ['Steam', 'steamapps', 'common', 'Zenimax Online', 'Launcher', 'Bethesda.net_Launcher.exe'];
let bethesdaBasePath = '';

// Check Program Files (x86) first, then Program Files
if (fs.existsSync(path.join(programFilesPaths.x86, ...steamPath))) {
  bethesdaBasePath = programFilesPaths.x86;
} else if (fs.existsSync(path.join(programFilesPaths.standard, ...steamPath))) {
  bethesdaBasePath = programFilesPaths.standard;
}

const defaultPaths = {
  steam: 'steam://rungameid/306130',
  bethesda: bethesdaBasePath ? path.join(bethesdaBasePath, ...steamPath) : '',
  ttc: path.join(userHome, 'Documents', 'Elder Scrolls Online', 'live', 'AddOns', 'TamrielTradeCentre', 'Client', 'Client.exe')
};

// Elements
const elements = {
  useEsoSales: document.getElementById('useEsoSales'),
  addonStatus: document.getElementById('addonStatus'),
  desktopShortcut: document.getElementById('desktopShortcut'),
  taskbarPin: document.getElementById('taskbarPin'),
  steamLaunch: document.getElementById('steamLaunch'),
  steamPath: document.getElementById('steamPath'),
  bethesdaLaunch: document.getElementById('bethesdaLaunch'),
  bethesdaPath: document.getElementById('bethesdaPath'),
  bethesdaBrowse: document.getElementById('bethesdaBrowse'),
  useTTC: document.getElementById('useTTC'),
  ttcStatus: document.getElementById('ttcStatus'),
  ttcPath: document.getElementById('ttcPath'),
  ttcBrowse: document.getElementById('ttcBrowse'),
  playButton: document.getElementById('playButton'),
  countdown: document.getElementById('countdown'),
  banner: document.getElementById('banner'),
  createDesktopShortcut: document.getElementById('createDesktopShortcut'),
  pinToStart: document.getElementById('pinToStart'),
  autoLaunch: document.getElementById('autoLaunch')
};

// Load saved settings
const settings = store.get('settings') || {
  useEsoSales: true,
  steamLaunch: true,
  steamPath: defaultPaths.steam,
  bethesdaLaunch: false,
  bethesdaPath: defaultPaths.bethesda,
  useTTC: false,
  ttcPath: defaultPaths.ttc,
  firstLaunchComplete: false,
  autoLaunch: true
};

// Initialize UI with saved settings
function initializeUI() {
  Object.entries(settings).forEach(([key, value]) => {
    if (elements[key]) {
      if (typeof value === 'boolean') {
        elements[key].checked = value;
      } else {
        elements[key].value = value;
      }
    }
  });

  updatePathStates();
  checkAddons();
  cycleBanner();
  
  if (settings.firstLaunchComplete && settings.autoLaunch) {
    elements.playButton.textContent = 'PAUSE';
    elements.playButton.setAttribute('data-state', 'pause');
    startCountdown();
  } else {
    elements.playButton.textContent = 'PLAY ESO';
  }

}

// Update input states based on checkboxes
function updatePathStates() {
  elements.steamPath.disabled = !elements.steamLaunch.checked;
  elements.bethesdaPath.disabled = !elements.bethesdaLaunch.checked;
  elements.bethesdaBrowse.disabled = !elements.bethesdaLaunch.checked;
  elements.ttcPath.disabled = !elements.useTTC.checked;
  elements.ttcBrowse.disabled = !elements.useTTC.checked;
}

// Check addon installations
function checkAddons() {
  const esoSalesPath = path.join(userHome, 'Documents', 'Elder Scrolls Online', 'live', 'AddOns', 'ESOSales');
  const ttcPath = path.join(userHome, 'Documents', 'Elder Scrolls Online', 'live', 'AddOns', 'TamrielTradeCentre');

  if (elements.useEsoSales.checked) {
    if (fs.existsSync(esoSalesPath)) {
      elements.addonStatus.innerHTML = '✓ Addon found. Remember to enable it in-game!';
      elements.addonStatus.className = 'status-message success';
    } else {
      const addonsPath = path.join(userHome, 'Documents', 'Elder Scrolls Online', 'live', 'AddOns');
      elements.addonStatus.innerHTML = `✗ No addon. You have the client, so place ESOSales folder in the <a href="#" class="addon-link" data-path="${addonsPath}">AddOns Folder</a> then restart.`;
      elements.addonStatus.className = 'status-message error';
    }
  } else {
    elements.addonStatus.textContent = '';
  }

  if (elements.useTTC.checked) {
    if (fs.existsSync(ttcPath)) {
      elements.ttcStatus.textContent = '✓ Addon found. Remember to enable it in-game!';
      elements.ttcStatus.className = 'status-message success';
    } else {
      elements.ttcStatus.textContent = '✗ Client could not be found.';
      elements.ttcStatus.className = 'status-message error';
    }
  } else {
    elements.ttcStatus.textContent = '';
  }
}

// Banner rotation
function cycleBanner() {
  const bannerDir = path.join(__dirname, 'banners');
  const banners = fs.readdirSync(bannerDir).filter(file => file.endsWith('.png'));
  const currentBanner = elements.banner.dataset.current;
  
  let newBanner;
  do {
    newBanner = banners[Math.floor(Math.random() * banners.length)];
  } while (newBanner === currentBanner && banners.length > 1);
  
  elements.banner.style.backgroundImage = `url('banners/${newBanner}')`;
  elements.banner.dataset.current = newBanner;
  
  setTimeout(cycleBanner, 15000);
}

let countdownInterval;

function startCountdown() {

  let count = 5;
  elements.countdown.textContent = `Launching in ${count}...`;
  
  countdownInterval = setInterval(() => {
    count--;
    elements.countdown.textContent = `Launching in ${count}...`;
    
    if (count <= 0) {
      clearInterval(countdownInterval);
      elements.countdown.textContent = '';
      elements.playButton.textContent = 'PLAY ESO';
      launchGame(true);
    }
  }, 1000);
  
}

function launchGame(forceLaunch = false) {
  if (elements.playButton.textContent === 'PAUSE') {
    clearInterval(countdownInterval);
    elements.countdown.textContent = '';
    elements.playButton.textContent = 'PLAY ESO';
    elements.playButton.removeAttribute('data-state');
    settings.firstLaunchComplete = false;
    store.set('settings', settings);
    return;
  }

  Object.entries(elements).forEach(([key, element]) => {
    if (element && (element.type === 'checkbox' || element.type === 'text')) {
      settings[key] = element.type === 'checkbox' ? element.checked : element.value;
    }
  });
  
  settings.firstLaunchComplete = true;
  store.set('settings', settings);
  
  if (settings.autoLaunch && !forceLaunch) {
    elements.playButton.textContent = 'PAUSE';
    elements.playButton.setAttribute('data-state', 'pause');
    startCountdown();
    return;
  }
  
  ipcRenderer.send('launch-game', settings);
}

// Add file dialog functionality
async function showFileDialog() {
  const result = await ipcRenderer.invoke('show-open-dialog', {
    properties: ['openFile'],
    filters: [{ name: 'Executables', extensions: ['exe'] }]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
}

// Update browse button handlers
elements.bethesdaBrowse.addEventListener('click', async () => {
  const filePath = await showFileDialog();
  if (filePath) {
    elements.bethesdaPath.value = filePath;
  }
});

elements.ttcBrowse.addEventListener('click', async () => {
  const filePath = await showFileDialog();
  if (filePath) {
    elements.ttcPath.value = filePath;
  }
});

// Add this function to save settings
function saveSettings() {
  Object.entries(elements).forEach(([key, element]) => {
    if (element && (element.type === 'checkbox' || element.type === 'text')) {
      settings[key] = element.type === 'checkbox' ? element.checked : element.value;
    }
  });
  store.set('settings', settings);
}

// Update these event listeners to save settings
elements.useEsoSales.addEventListener('change', () => {
  checkAddons();
  saveSettings();
});

elements.useTTC.addEventListener('change', () => {
  updatePathStates();
  checkAddons();
  saveSettings();
});

elements.steamLaunch.addEventListener('change', () => {
  if (elements.steamLaunch.checked) {
    elements.bethesdaLaunch.checked = false;
  }
  updatePathStates();
  saveSettings();
});

elements.bethesdaLaunch.addEventListener('change', () => {
  if (elements.bethesdaLaunch.checked) {
    elements.steamLaunch.checked = false;
  }
  updatePathStates();
  saveSettings();
});

// Add input event listeners for path fields
elements.steamPath.addEventListener('change', saveSettings);
elements.bethesdaPath.addEventListener('change', saveSettings);
elements.ttcPath.addEventListener('change', saveSettings);

elements.playButton.addEventListener('click', launchGame);

elements.createDesktopShortcut.addEventListener('click', () => {
  const button = elements.createDesktopShortcut;
  // Show loading state
  button.classList.add('loading');
  button.innerHTML = '<div class="loading-spinner"></div>';
  button.disabled = true;

  ipcRenderer.send('create-desktop-shortcut');
  
  // Check status after a delay to allow for file creation
  setTimeout(() => {
    updateShortcutButtons();
    button.classList.remove('loading');
  }, 1000);
});

elements.pinToStart.addEventListener('click', () => {
  ipcRenderer.send('pin-to-start');
  setTimeout(updateShortcutButtons, 1000);
});

// Status message visibility handlers
function updateStatusMessageVisibility(checkboxId, statusId) {
  const checkbox = document.getElementById(checkboxId);
  const statusElement = document.getElementById(statusId);
  
  statusElement.classList.toggle('hidden', !checkbox.checked);
}

// Add listeners for both checkboxes
document.getElementById('useEsoSales').addEventListener('change', () => {
  updateStatusMessageVisibility('useEsoSales', 'addonStatus');
});

document.getElementById('useTTC').addEventListener('change', () => {
  updateStatusMessageVisibility('useTTC', 'ttcStatus');
});

// Initial visibility state on page load
updateStatusMessageVisibility('useEsoSales', 'addonStatus');
updateStatusMessageVisibility('useTTC', 'ttcStatus');

// Add click handler for the addons folder link
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('addon-link')) {
    e.preventDefault();
    const folderPath = e.target.dataset.path;
    ipcRenderer.send('open-folder', folderPath);
  }
});

// Add more event listeners to trigger addon checks
const uiElements = ['useEsoSales', 'steamLaunch', 'bethesdaLaunch', 'steamPath', 'bethesdaPath'];
uiElements.forEach(elementId => {
  const element = document.getElementById(elementId);
  if (element) {
    if (element.type === 'checkbox') {
      element.addEventListener('change', checkAddons);
    } else {
      element.addEventListener('input', checkAddons);
      element.addEventListener('blur', checkAddons);
    }
  }
});

// Add check on window focus
window.addEventListener('focus', () => {
  checkAddons();
  updateShortcutButtons();
});

// Add event listener for autoLaunch checkbox
elements.autoLaunch.addEventListener('change', () => {
  settings.autoLaunch = elements.autoLaunch.checked;
  store.set('settings', settings);
});

// Add these functions
async function updateShortcutButtons() {
  const desktopButton = elements.createDesktopShortcut;
  const startButton = elements.pinToStart;
  
  ipcRenderer.invoke('check-shortcuts').then(({ desktopShortcut, startPin }) => {
    // Only update if button is not in loading state
    if (!desktopButton.classList.contains('loading')) {
      if (desktopShortcut) {
        desktopButton.classList.add('completed');
        desktopButton.innerHTML = 'Desktop Shortcut Created <span class="checkmark">✓</span>';
        desktopButton.disabled = true;
      } else {
        desktopButton.classList.remove('completed');
        desktopButton.innerHTML = 'Create ESO Sales Desktop Shortcut';
        desktopButton.disabled = false;
      }
    }
    
    // Only show Pin to Start on Windows when not in test mode
    if (!TEST_MODE) {
      startButton.style.display = 'block';
      if (startPin) {
        startButton.classList.add('completed');
        startButton.innerHTML = 'Added to Start Menu <span class="checkmark">✓</span>';
        startButton.disabled = true;
      } else {
        startButton.classList.remove('completed');
        startButton.innerHTML = 'Add to Start Menu';
        startButton.disabled = false;
      }
    } else {
      startButton.style.display = 'none';
    }
  });
}

// Initialize
initializeUI();
updateShortcutButtons(); 