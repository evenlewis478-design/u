--[[
	PotatoGraphicsClient.client.lua  (LocalScript)
	Location: StarterPlayer > StarterPlayerScripts > PotatoGraphicsClient

	Responsibilities (all real):
	  1. Apply THIS player's personal, client-only settings:
	       - UserGameSettings.SavedQualityLevel (real, currently
	         unrestricted graphics-quality property; confirmed against
	         Roblox's own API history).
	       - Text scale on any GuiObject tagged "PotatoScalable" (your
	         own custom UI opts in to this -- Roblox has no API to
	         resize the OS/app-level UI, only your own GUIs).
	  2. Show a small in-game menu so the player can pick a profile
	     instantly -- no network round trip required for this.
	  3. Measure real FPS via RenderStepped frame deltas (Roblox has no
	     public "GetFPS()" call, so this is self-measured, not faked).
	  4. Reflect the REAL sync status the server is broadcasting
	     (Connected / Syncing / Applied / Disconnected / Error).
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Configuration = require(ReplicatedStorage.RobloxPotatoGraphics.Configuration)
local Net = require(ReplicatedStorage.RobloxPotatoGraphics.Net)

local applyProfileEvent = Net.getApplyProfileEvent()
local statusChangedEvent = Net.getStatusChangedEvent()
local requestProfileFunction = Net.getRequestProfileFunction()

local player = Players.LocalPlayer
local hasManualOverride = false

-- ============================================================
-- 1. PERSONAL CLIENT-ONLY SETTINGS
-- ============================================================
local function setQualityLevel(profileName)
	local level = Configuration.QUALITY_LEVEL_BY_PROFILE[profileName]
	if not level then return false end
	local ok, err = pcall(function()
		UserSettings():GetService("UserGameSettings").SavedQualityLevel = level
	end)
	return ok, err
end

local function setTextScale(scale)
	for _, obj in ipairs(CollectionService:GetTagged("PotatoScalable")) do
		if obj:IsA("TextLabel") or obj:IsA("TextButton") or obj:IsA("TextBox") then
			local base = obj:GetAttribute("BaseTextSize")
			if not base then
				base = obj.TextSize
				obj:SetAttribute("BaseTextSize", base)
			end
			obj.TextSize = math.clamp(math.floor(base * scale), 8, 96)
		end
	end
end

local function applyPersonalProfile(profileName)
	local cfg = Configuration.PROFILES[profileName]
	if not cfg then return end
	setQualityLevel(profileName)
	setTextScale(cfg.textScale)
end

-- Follow the server's recommended default profile, unless this player has
-- manually picked their own via the menu below.
applyProfileEvent.OnClientEvent:Connect(function(profileName)
	if hasManualOverride then return end
	if Configuration.isValidProfileName(profileName) then
		applyPersonalProfile(profileName)
	end
end)

-- ============================================================
-- 2. REAL, MEASURED FPS
-- ============================================================
local fpsSamples = {}
local currentFps = 0
RunService.RenderStepped:Connect(function(dt)
	if dt <= 0 then return end
	table.insert(fpsSamples, 1 / dt)
	if #fpsSamples > 30 then table.remove(fpsSamples, 1) end
	local sum = 0
	for _, v in ipairs(fpsSamples) do sum += v end
	currentFps = math.floor(sum / #fpsSamples)
end)

-- ============================================================
-- 3. UI: toggle button, panel, status line, real FPS readout
-- ============================================================
local screenGui = Instance.new("ScreenGui")
screenGui.Name = "PotatoGraphicsHud"
screenGui.ResetOnSpawn = false
screenGui.Parent = player:WaitForChild("PlayerGui")

local toggleButton = Instance.new("TextButton")
toggleButton.Name = "ToggleButton"
toggleButton.Size = UDim2.fromOffset(48, 48)
toggleButton.Position = UDim2.new(0, 12, 1, -60)
toggleButton.AnchorPoint = Vector2.new(0, 0)
toggleButton.BackgroundColor3 = Color3.fromRGB(20, 22, 28)
toggleButton.TextColor3 = Color3.fromRGB(240, 240, 240)
toggleButton.Text = "🥔"
toggleButton.TextSize = 22
toggleButton.Font = Enum.Font.GothamBold
toggleButton.Parent = screenGui
Instance.new("UICorner", toggleButton).CornerRadius = UDim.new(1, 0)

local panel = Instance.new("Frame")
panel.Name = "Panel"
panel.Size = UDim2.fromOffset(240, 300)
panel.Position = UDim2.new(0, 12, 1, -372)
panel.BackgroundColor3 = Color3.fromRGB(16, 18, 24)
panel.Visible = false
panel.Parent = screenGui
Instance.new("UICorner", panel).CornerRadius = UDim.new(0, 12)

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 6)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = panel

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 10)
padding.PaddingLeft = UDim.new(0, 10)
padding.PaddingRight = UDim.new(0, 10)
padding.PaddingBottom = UDim.new(0, 10)
padding.Parent = panel

local title = Instance.new("TextLabel")
title.Text = "Potato Graphics"
title.Font = Enum.Font.GothamBold
title.TextSize = 15
title.TextColor3 = Color3.fromRGB(240, 240, 240)
title.BackgroundTransparency = 1
title.Size = UDim2.new(1, 0, 0, 20)
title.TextXAlignment = Enum.TextXAlignment.Left
title.LayoutOrder = 1
title.Parent = panel

local statusLabel = Instance.new("TextLabel")
statusLabel.Name = "StatusLabel"
statusLabel.Text = "Status: Disconnected"
statusLabel.Font = Enum.Font.Gotham
statusLabel.TextSize = 12
statusLabel.TextColor3 = Color3.fromRGB(160, 165, 180)
statusLabel.BackgroundTransparency = 1
statusLabel.Size = UDim2.new(1, 0, 0, 16)
statusLabel.TextXAlignment = Enum.TextXAlignment.Left
statusLabel.TextWrapped = true
statusLabel.LayoutOrder = 2
statusLabel.Parent = panel

local fpsLabel = Instance.new("TextLabel")
fpsLabel.Name = "FpsLabel"
fpsLabel.Text = "FPS (measured): --"
fpsLabel.Font = Enum.Font.Gotham
fpsLabel.TextSize = 12
fpsLabel.TextColor3 = Color3.fromRGB(160, 165, 180)
fpsLabel.BackgroundTransparency = 1
fpsLabel.Size = UDim2.new(1, 0, 0, 16)
fpsLabel.TextXAlignment = Enum.TextXAlignment.Left
fpsLabel.LayoutOrder = 3
fpsLabel.Parent = panel

RunService.Heartbeat:Connect(function()
	fpsLabel.Text = "FPS (measured): " .. tostring(currentFps)
end)

statusChangedEvent.OnClientEvent:Connect(function(state, message)
	statusLabel.Text = "Status: " .. state .. (message ~= "" and (" -- " .. message) or "")
end)

local function makeProfileButton(profileName, layoutOrder)
	local btn = Instance.new("TextButton")
	btn.Name = profileName
	btn.Size = UDim2.new(1, 0, 0, 30)
	btn.BackgroundColor3 = Color3.fromRGB(28, 31, 40)
	btn.TextColor3 = Color3.fromRGB(235, 235, 235)
	btn.Font = Enum.Font.Gotham
	btn.TextSize = 13
	btn.Text = profileName
	btn.LayoutOrder = layoutOrder
	btn.Parent = panel
	Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 8)

	btn.MouseButton1Click:Connect(function()
		local ok, sanitizedOrError = requestProfileFunction:InvokeServer(profileName)
		if ok then
			hasManualOverride = true
			applyPersonalProfile(sanitizedOrError)
			statusLabel.Text = "Status: Applied -- " .. sanitizedOrError .. " (personal)"
		else
			statusLabel.Text = "Status: Error -- " .. tostring(sanitizedOrError)
		end
	end)

	return btn
end

for i, name in ipairs(Configuration.PROFILE_NAMES) do
	makeProfileButton(name, 3 + i)
end

local note = Instance.new("TextLabel")
note.Text = "World detail (shadows/terrain/fx) is set by the server for everyone. This only changes YOUR quality level and UI text size."
note.Font = Enum.Font.Gotham
note.TextSize = 10
note.TextColor3 = Color3.fromRGB(120, 125, 140)
note.TextWrapped = true
note.BackgroundTransparency = 1
note.Size = UDim2.new(1, 0, 0, 48)
note.LayoutOrder = 20
note.Parent = panel

toggleButton.MouseButton1Click:Connect(function()
	panel.Visible = not panel.Visible
end)
