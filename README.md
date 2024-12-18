# ESOSales

## Overview
ESOSales is an addon for Elder Scrolls Online that tracks and reports your guild sales data to ESO-Sales.com for detailed analytics and sale notifications.

## Features
- Automatic sales tracking across all your guild stores
- Integration with TamrielTradeCenter (optional)
- User-friendly launcher application
- Secure data handling and transmission
- Customizable settings
- Sale notifications and data analysis via ESO-Sales.com

## Requirements
- Elder Scrolls Online (PC/Mac)
- LibHistoire dependency
- Windows/Mac OS X

## Installation

### Building the Launcher
1. Clone the repository
2. Navigate with `cd ESOSales/Client/source-code`
2. Run `npm install`
3. Run `npm run make`
4. The built executable will be in the `./out` directory

### Addon & Launcher Installation
1. Clone the repo or download the zip file
2. Unzip the files, and place "ESOSales" in your ESO addons directory:
   - Windows: `Documents\Elder Scrolls Online\live\AddOns`
3. Run the launcher application in `ESOSales/Client/ESOSalesLauncher.exe` (after addon has been approved to store the .exe in this repo. otherwise run the ESOSalesLauncher wherever it may be after maunally building it)
4. Configure your preferred launch options:
   - Steam launch
   - Bethesda launcher
   - Desktop shortcut (optional)
   - Auto-launch (optional)
   - TTC integration (optional)
5. Launch the game!
6. (In-Game) Page through guild history in the Guild Menu (G by default) to gather sales data for ESO Sales.
7. (In-Game) Run /reloadui to send data to ESO Sales and TTC (if enabled).

## Usage

### In-Game
- The addon automatically tracks sales data
- No manual configuration needed
- Use `/esosales` for help with commands

### Launcher
- Launch ESO and supporting applications
- Monitor addon status
- Configure auto-launch settings
- Create desktop shortcuts
- Pin to Start menu

## Privacy & Data
- Only guild store sales data is collected
- No personal information is transmitted
- Data is sent securely to ESO-Sales.com
- Optional: Disable data collection through settings

## Support
- Visit [ESO-Sales.com](https://eso-sales.com) for documentation
- Report issues with the addon to support@bullardtechnologies.com
- Join our Discord community for support

## Credits
- Author: @cymi
- Dependencies: LibHistoire
- Special thanks to the ESO addon community

## License
All Rights Reserved. This addon is licensed, not sold. See LICENSE file for details.

The addon source code is available for review as required by ESOUI.com policies. Usage of this addon constitutes acceptance of the terms at ESO-Sales.com.

## Commercial Use
ESO-Sales.com and related services are proprietary products of Bullard Technologies LLC. Commercial use, redistribution, or reuse of any part of the ESO-Sales.com service is prohibited without explicit written permission.

## Legal
This Add-on is not created by, affiliated with or sponsored by ZeniMax Media Inc. or its affiliates. The Elder Scrolls® and related logos are registered trademarks or trademarks of ZeniMax Media Inc. in the United States and/or other countries. All rights reserved.

## Version History
- 1.0.0: Initial release
  - Basic sales tracking
  - Launcher application
  - TTC integration