-- Initialize addon namespace
ESOSales = {}
local ESOSalesAddon = ESOSales
ESOSalesAddon.name = "ESOSales"

-- Add tracking variables
ESOSalesAddon.totalEventsToProcess = 0
ESOSalesAddon.guildProcessedEvents = {}
ESOSalesAddon.guildIsProcessingHistory = {} -- New: Track if we're still processing history for each guild

-- Check for LibHistoire
function ESOSalesAddon.CheckDependencies()
    if not LibHistoire then
        -- CHAT_SYSTEM:AddMessage(string.format("[%s] ERROR: Required library LibHistoire is missing!", ESOSalesAddon.name))
        return false
    end
    -- CHAT_SYSTEM:AddMessage(string.format("[%s] Found LibHistoire library", ESOSalesAddon.name))
    return true
end

-- Track how many sales we've printed per guild
ESOSalesAddon.guildSalesCounted = {}

-- Process a sale event (for now just printing debug info)
function ESOSalesAddon.ProcessSaleEvent(guildId, event)
    if not event then
        return
    end

    -- Initialize counter for this guild if needed
    ESOSalesAddon.guildSalesCounted[guildId] = ESOSalesAddon.guildSalesCounted[guildId] or 0
    
    local guildName = GetGuildName(guildId)
    local eventId, timeStamp, isRedacted, eventType, sellerName, buyerName, itemLink, quantity, price, tax = GetGuildHistoryTraderEventInfo(guildId, event:GetEventIndex())
    
    -- Get item details from the link
    local itemName = GetItemLinkName(itemLink) or ""
    local itemIcon = GetItemLinkIcon(itemLink) or ""
    local itemQuality = GetItemLinkDisplayQuality(itemLink) or 0
    
    -- Get guild trader info (if available)
    local hasTraderData = DoesGuildDataHaveInitializedAttributes(guildId, GUILD_META_DATA_ATTRIBUTE_KIOSK)
    local trader = ""
    
    if hasTraderData then
        -- Get kiosk info from guild metadata
        local kioskData = GetGuildOwnedKioskInfo(guildId)
        if kioskData then
            trader = kioskData
        end
    end
    
    -- Get megaserver information
    local megaserver = GetWorldName()
    
    -- Prepare data for API submission with nil checks
    local saleData = {
        guildId = guildId,
        guildName = guildName or "",
        eventId = eventId,
        timeStamp = timeStamp,
        isRedacted = isRedacted,
        eventType = eventType,
        sellerName = sellerName or "",
        buyerName = buyerName or "",
        itemName = itemName,
        itemLink = itemLink,
        itemIcon = itemIcon,
        itemQuality = itemQuality,
        quantity = quantity or 0,
        price = price or 0,
        tax = tax or 0,
        trader = trader,
        megaserver = megaserver
    }

    -- Send to API
    ESOSalesAddon.SendToAPI(saleData)

    -- Increment the counter
    ESOSalesAddon.guildSalesCounted[guildId] = ESOSalesAddon.guildSalesCounted[guildId] + 1

end

-- Constants for bucket management
ESOSalesAddon.BUCKET_MAX_ENTRIES = 7000
ESOSalesAddon.CURRENT_BUCKET = 1
ESOSalesAddon.MEMORY_QUEUE = {}
ESOSalesAddon.BUCKET_LOCKS = {}

-- Add settings for logging
ESOSalesAddon.settings = ZO_SavedVars:NewAccountWide("ESOSales_Settings", 1, nil, {
    currentBucket = 1,
    bucketCounts = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
    logBucketData = false,
    logGeneralData = true,
    enableReloadPrompt = true,
    lastLoginDay = 0,
    hasShownPromptThisLogin = false,
    reloadWindowPosition = {
        offsetX = GuiRoot:GetWidth() / 2 - 200,  -- Half window width (400/2)
        offsetY = GuiRoot:GetHeight() / 2 - 175   -- Half window height (350/2)
    }
})

-- New helper function for logging
function ESOSalesAddon.Log(message, isBucketLog)
    if isBucketLog and not ESOSalesAddon.settings.logBucketData then return end
    if not isBucketLog and not ESOSalesAddon.settings.logGeneralData then return end
    -- CHAT_SYSTEM:AddMessage(string.format("[%s] %s", ESOSalesAddon.name, message))
end

-- Update SendToAPI function with detailed logging
function ESOSalesAddon.SendToAPI(saleData)
    local currentBucket = ESOSalesAddon.settings.currentBucket
    local bucketData = ESOSalesAddon.buckets[currentBucket]
    
    ESOSalesAddon.Log(string.format("Attempting to add sale to bucket %d (current size: %d/%d)", 
        currentBucket, #bucketData.entries, ESOSalesAddon.BUCKET_MAX_ENTRIES), true)
    
    -- Check if current bucket is locked or full
    if bucketData.locked or #bucketData.entries >= ESOSalesAddon.BUCKET_MAX_ENTRIES then
        ESOSalesAddon.Log(string.format("Bucket %d is %s. Searching for next available bucket...", 
            currentBucket, bucketData.locked and "locked" or "full"), true)
        
        -- Try to find next available bucket
        local foundBucket = false
        for i = 1, 10 do
            local nextBucket = (currentBucket % 10) + 1
            if not ESOSalesAddon.buckets[nextBucket].locked and #ESOSalesAddon.buckets[nextBucket].entries < ESOSalesAddon.BUCKET_MAX_ENTRIES then
                currentBucket = nextBucket
                bucketData = ESOSalesAddon.buckets[currentBucket]
                foundBucket = true
                ESOSalesAddon.Log(string.format("Found available bucket %d (current size: %d/%d)", 
                    currentBucket, #bucketData.entries, ESOSalesAddon.BUCKET_MAX_ENTRIES), true)
                break
            end
            ESOSalesAddon.Log(string.format("Bucket %d is unavailable (%s)", 
                nextBucket, ESOSalesAddon.buckets[nextBucket].locked and "locked" or "full"), true)
        end
        
        if not foundBucket then
            table.insert(ESOSalesAddon.MEMORY_QUEUE, saleData)
            ESOSalesAddon.Log(string.format("All buckets full/locked. Added to memory queue (%d items)", 
                #ESOSalesAddon.MEMORY_QUEUE), true)
            return
        end
    end
    
    -- Add data to bucket and EXPLICITLY save it
    bucketData.entries[#bucketData.entries + 1] = saleData
    -- Force the SavedVariables to recognize the change
    ESOSalesAddon.buckets[currentBucket] = bucketData
    
    -- Update counts and settings
    ESOSalesAddon.settings.bucketCounts[currentBucket] = #bucketData.entries
    ESOSalesAddon.settings.currentBucket = currentBucket
    
    ESOSalesAddon.Log(string.format("Added sale to bucket %d: %s x%d for %d gold", 
        currentBucket, saleData.itemLink, saleData.quantity, saleData.price), true)
    
    -- Periodic bucket status update
    if #bucketData.entries % 100 == 0 then
        local bucketStatus = "Bucket Status:\n"
        for i = 1, 10 do
            local bucket = ESOSalesAddon.buckets[i]
            bucketStatus = bucketStatus .. string.format("Bucket %d: %d/%d entries (%s)\n", 
                i, #bucket.entries, ESOSalesAddon.BUCKET_MAX_ENTRIES, bucket.locked and "locked" or "available")
        end
        ESOSalesAddon.Log(bucketStatus, true)
    end
    
    -- After successfully adding to bucket, try to process memory queue
    if #ESOSalesAddon.MEMORY_QUEUE > 0 then
        ESOSalesAddon.ProcessMemoryQueue()
    end
end

-- Set up history processor for a guild
function ESOSalesAddon.InitializeGuildProcessor(guildId)
    --CHAT_SYSTEM:AddMessage(string.format("[%s] Initializing processor for guild %d", ESOSalesAddon.name, guildId))
    
    -- Initialize tracking variables for this guild
    ESOSalesAddon.guildProcessedEvents[guildId] = 0
    ESOSalesAddon.guildIsProcessingHistory[guildId] = true
    
    local processor = LibHistoire:CreateGuildHistoryProcessor(
        guildId, 
        GUILD_HISTORY_STORE,
        ESOSalesAddon.name
    )
    
    if not processor then return end

    -- Get current timestamp and 7 days ago
    local currentTime = GetTimeStamp()
    local sevenDaysAgo = currentTime - (7 * 24 * 60 * 60)

    -- Set minimum time to process (7 days ago)
    processor:SetAfterEventTime(sevenDaysAgo)

    -- Set up event callback for both historical and new events
    processor:SetEventCallback(function(event)
        -- Update the guild-specific counter instead of global
        ESOSalesAddon.guildProcessedEvents[guildId] = ESOSalesAddon.guildProcessedEvents[guildId] + 1
        ESOSalesAddon.ProcessSaleEvent(guildId, event)

    end)

    -- Set up stop callback to log final stats (updated to use guild-specific counter)
    processor:SetOnStopCallback(function(reason)
        if reason == LibHistoire.StopReason.ITERATION_COMPLETED then
            CHAT_SYSTEM:AddMessage(string.format("[%s] Finished processing %d historical events for guild %s",
                ESOSalesAddon.name, ESOSalesAddon.guildProcessedEvents[guildId], GetGuildName(guildId)))
        end
    end)

    -- Set up progress tracking
    processor:SetRegisteredForFutureEventsCallback(function()
        ESOSalesAddon.guildIsProcessingHistory[guildId] = false
        -- CHAT_SYSTEM:AddMessage(string.format("[%s] Now monitoring new sales for guild %s", ESOSalesAddon.name, GetGuildName(guildId)))
        -- CHAT_SYSTEM:AddMessage(string.format("[%s] Processed %d historical events", ESOSalesAddon.name, ESOSalesAddon.guildProcessedEvents[guildId]))
        
        -- Increment completed guilds counter and log the current state
        ESOSalesAddon.completedGuildsCount = ESOSalesAddon.completedGuildsCount + 1
        -- CHAT_SYSTEM:AddMessage(string.format("[%s] Guild completion status:", ESOSalesAddon.name))
        -- CHAT_SYSTEM:AddMessage(string.format("- Completed guilds: %d/%d", ESOSalesAddon.completedGuildsCount, ESOSalesAddon.totalGuildsToProcess))
        -- CHAT_SYSTEM:AddMessage(string.format("- Has shown prompt this login: %s", tostring(ESOSalesAddon.settings.hasShownPromptThisLogin)))
        -- CHAT_SYSTEM:AddMessage(string.format("- Reload prompt enabled: %s", tostring(ESOSalesAddon.settings.enableReloadPrompt)))
        
        -- Check conditions for showing reload window
        local shouldShowWindow = ESOSalesAddon.completedGuildsCount >= ESOSalesAddon.totalGuildsToProcess and 
                               not ESOSalesAddon.settings.hasShownPromptThisLogin and 
                               ESOSalesAddon.settings.enableReloadPrompt
        
        -- CHAT_SYSTEM:AddMessage(string.format("[%s] Should show reload window: %s", ESOSalesAddon.name, tostring(shouldShowWindow)))
        
        if shouldShowWindow then
            -- ESOSalesAddon.reloadWindow:SetHidden(false) -- Disabled for now
            ESOSalesAddon.settings.hasShownPromptThisLogin = true  -- Update persistent setting
            -- CHAT_SYSTEM:AddMessage(string.format("[%s] Showing reload window", ESOSalesAddon.name))
        end
    end)

    -- Start streaming events without using lastProcessedId
    processor:StartStreaming()
end

-- Register addon initialization when player is activated
function ESOSalesAddon.Initialize()
    if not ESOSalesAddon.CheckDependencies() then return end
    
    -- Create the reload UI window
    ESOSalesAddon.reloadWindow = ESOSalesAddon.CreateReloadUI()
    
    LibHistoire:OnReady(function()
        -- Count total guilds to process
        ESOSalesAddon.totalGuildsToProcess = GetNumGuilds()
        ESOSalesAddon.completedGuildsCount = 0
        
        -- Initialize processors for all guilds
        for guildId = 1, GetNumGuilds() do
            local guildId = GetGuildId(guildId)
            if guildId then
                ESOSalesAddon.InitializeGuildProcessor(guildId)
            end
        end
        
        -- CHAT_SYSTEM:AddMessage(string.format("[%s] Initialized and monitoring guild sales!", ESOSalesAddon.name))
    end)
end

-- Register event handler for when player is activated
function ESOSalesAddon.OnAddOnLoaded(event, addonName)
    if addonName ~= ESOSalesAddon.name then return end
    
    -- Initialize settings
    ESOSalesAddon.settings = ZO_SavedVars:NewAccountWide("ESOSales_Settings", 1, nil, {
        currentBucket = 1,
        bucketCounts = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
        logBucketData = false,
        logGeneralData = true,
        enableReloadPrompt = true,
        lastLoginDay = 0,
        hasShownPromptThisLogin = false,
        reloadWindowPosition = {
            offsetX = GuiRoot:GetWidth() / 2 - 200,  -- Half window width (400/2)
            offsetY = GuiRoot:GetHeight() / 2 - 175   -- Half window height (350/2)
        }
    })
    
    -- Check if this is a new day (initial login) vs a reload
    local currentDay = GetDate()
    if currentDay ~= ESOSalesAddon.settings.lastLoginDay then
        -- This is a new day/initial login, reset the prompt flag
        ESOSalesAddon.settings.hasShownPromptThisLogin = false
        -- CHAT_SYSTEM:AddMessage(string.format("[%s] Last login day: %s", ESOSalesAddon.name, ESOSalesAddon.settings.lastLoginDay))
        ESOSalesAddon.settings.lastLoginDay = currentDay
        -- CHAT_SYSTEM:AddMessage(string.format("[%s] Last login day: %s", ESOSalesAddon.name, currentDay))
        -- CHAT_SYSTEM:AddMessage(string.format("[%s] New login detected - Reset prompt status", ESOSalesAddon.name))
    end
    
    -- Initialize savedVariables and continue with existing initialization
    ESOSalesAddon.savedVariables = ESOSalesAddon.settings

    -- Initialize data buckets
    ESOSalesAddon.buckets = {
        ZO_SavedVars:NewAccountWide("ESOSales_Bucket1", 1, nil, { entries = {}, locked = false }),
        ZO_SavedVars:NewAccountWide("ESOSales_Bucket2", 1, nil, { entries = {}, locked = false }),
        ZO_SavedVars:NewAccountWide("ESOSales_Bucket3", 1, nil, { entries = {}, locked = false }),
        ZO_SavedVars:NewAccountWide("ESOSales_Bucket4", 1, nil, { entries = {}, locked = false }),
        ZO_SavedVars:NewAccountWide("ESOSales_Bucket5", 1, nil, { entries = {}, locked = false }),
        ZO_SavedVars:NewAccountWide("ESOSales_Bucket6", 1, nil, { entries = {}, locked = false }),
        ZO_SavedVars:NewAccountWide("ESOSales_Bucket7", 1, nil, { entries = {}, locked = false }),
        ZO_SavedVars:NewAccountWide("ESOSales_Bucket8", 1, nil, { entries = {}, locked = false }),
        ZO_SavedVars:NewAccountWide("ESOSales_Bucket9", 1, nil, { entries = {}, locked = false }),
        ZO_SavedVars:NewAccountWide("ESOSales_Bucket10", 1, nil, { entries = {}, locked = false })
    }
    
    ESOSalesAddon.Initialize()
    EVENT_MANAGER:UnregisterForEvent(ESOSalesAddon.name, EVENT_ADD_ON_LOADED)
end

-- Register the initialization event
EVENT_MANAGER:RegisterForEvent(ESOSalesAddon.name, EVENT_ADD_ON_LOADED, ESOSalesAddon.OnAddOnLoaded)

-- Add new function to process memory queue
function ESOSalesAddon.ProcessMemoryQueue()
    if #ESOSalesAddon.MEMORY_QUEUE == 0 then return end
    
    ESOSalesAddon.Log(string.format("Processing memory queue (%d items)...", #ESOSalesAddon.MEMORY_QUEUE), true)
    
    -- Try to process items from the queue
    local itemsProcessed = 0
    while #ESOSalesAddon.MEMORY_QUEUE > 0 do
        local saleData = table.remove(ESOSalesAddon.MEMORY_QUEUE, 1)
        
        -- Find an available bucket
        local currentBucket = ESOSalesAddon.settings.currentBucket
        local foundBucket = false
        
        for i = 1, 10 do
            local nextBucket = ((currentBucket + i - 1) % 10) + 1
            local bucketData = ESOSalesAddon.buckets[nextBucket]
            
            if not bucketData.locked and #bucketData.entries < ESOSalesAddon.BUCKET_MAX_ENTRIES then
                -- Add to bucket
                bucketData.entries[#bucketData.entries + 1] = saleData
                ESOSalesAddon.buckets[nextBucket] = bucketData
                ESOSalesAddon.settings.bucketCounts[nextBucket] = #bucketData.entries
                ESOSalesAddon.settings.currentBucket = nextBucket
                
                itemsProcessed = itemsProcessed + 1
                foundBucket = true
                break
            end
        end
        
        -- If no bucket available, put item back and stop processing
        if not foundBucket then
            table.insert(ESOSalesAddon.MEMORY_QUEUE, 1, saleData)
            break
        end
    end
    
    ESOSalesAddon.Log(string.format("Processed %d items from memory queue. %d items remaining.", 
        itemsProcessed, #ESOSalesAddon.MEMORY_QUEUE), true)
end

-- Add tracking for guild processing completion
ESOSalesAddon.totalGuildsToProcess = 0
ESOSalesAddon.completedGuildsCount = 0

-- Create the UI window
function ESOSalesAddon.CreateReloadUI()
    local window = ESOSalesReloadWindow
    
    -- Enable mouse and movement
    window:SetMovable(true)
    window:SetMouseEnabled(true)
    
    -- Create a drag handle area (this is important for ESO UI)
    local dragHandle = window:GetNamedChild("Toolbar")
    if dragHandle then
        dragHandle:SetMouseEnabled(true)
        dragHandle:SetHandler("OnMouseDown", function()
            window:StartMoving()
        end)
        
        dragHandle:SetHandler("OnMouseUp", function()
            window:StopMovingOrResizing()
            -- Save position
            local left, top = window:GetScreenRect()
            ESOSalesAddon.settings.reloadWindowPosition.offsetX = left
            ESOSalesAddon.settings.reloadWindowPosition.offsetY = top
        end)
    end
    
    -- Restore saved position
    if ESOSalesAddon.settings.reloadWindowPosition then
        window:ClearAnchors()
        window:SetAnchor(TOPLEFT, GuiRoot, TOPLEFT, 
            ESOSalesAddon.settings.reloadWindowPosition.offsetX,
            ESOSalesAddon.settings.reloadWindowPosition.offsetY)
    end
    
    -- Set window title
    local title = window:GetNamedChild("ToolbarTitle")
    if title then
        title:SetText("ESO Sales Sync")
    end
    
    -- Set up checkbox
    local checkbox = window:GetNamedChild("ButtonContainerCheckboxContainerCheckbox")
    if checkbox then
        ZO_CheckButton_SetToggleFunction(checkbox, function(control, checked)
            PlaySound(SOUNDS.DEFAULT_CLICK)
            ESOSalesAddon.settings.enableReloadPrompt = not checked
            -- CHAT_SYSTEM:AddMessage(string.format("[ESOSales] Reload prompt %s", checked and "disabled" or "enabled"))
        end)
        ZO_CheckButton_SetCheckState(checkbox, not ESOSalesAddon.settings.enableReloadPrompt)
    end
    
    -- Set up simple button handlers
    local dismissButton = window:GetNamedChild("FooterRow2CenterParentDismiss")
    if dismissButton then
        dismissButton:SetText(GetString(SI_DIALOG_CANCEL))
        dismissButton:SetHandler("OnClicked", function()
            window:SetHidden(true)
            PlaySound(SOUNDS.DEFAULT_CLICK)
        end)
    end
    
    local reloadButton = window:GetNamedChild("FooterRow2CenterParentReload")
    if reloadButton then
        reloadButton:SetText(GetString(SI_ADDON_MANAGER_RELOAD))
        reloadButton:SetHandler("OnClicked", function()
            PlaySound(SOUNDS.DEFAULT_CLICK)
            ReloadUI()
        end)
    end

    return window
end

-- Add these handler functions
function ESOSalesAddon.OnMouseEnter(control)
    if control.tooltipText then
        InitializeTooltip(InformationTooltip, control, BOTTOM, 0, -5)
        SetTooltipText(InformationTooltip, control.tooltipText)
    end
    PlaySound(SOUNDS.MENU_HOVER)
end

function ESOSalesAddon.OnMouseExit(control)
    if control.tooltipText then
        ClearTooltip(InformationTooltip)
    end
end

function ESOSalesAddon.OnCloseClicked(control)
    PlaySound(SOUNDS.DEFAULT_CLICK)
    control:GetParent():GetParent():SetHidden(true)
end

function ESOSalesAddon.OnReloadClicked(control)
    PlaySound(SOUNDS.DEFAULT_CLICK)
    ReloadUI()
end
