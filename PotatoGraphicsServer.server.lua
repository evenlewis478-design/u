--[[
	PotatoGraphicsServer.server.lua  (Script)
	Location: ServerScriptService > PotatoGraphicsServer

	Responsibilities (all real, no simulated behavior):
	  1. Apply the default profile's WORLD-level settings on startup.
	     (Lighting/Workspace/Terrain are shared by every player on this
	     server -- there is exactly one "world" state, so this can only
	     be one profile at a time, not per-player.)
	  2. Optionally poll a JSON URL you host (Configuration.SYNC_URL) so
	     you can retune presets without republishing the game. This uses
	     HttpService, which only works server-side -- confirmed by
	     Roblox's own error message on client attempts.
	  3. Validate and handle each player's REQUEST to change their own
	     personal (client-only) quality/text-scale profile.
	  4. Broadcast real status: Connected / Syncing / Applied /
	     Disconnected / Error -- based on the actual result of each
	     HTTP call, never invented.
]]

local HttpService = game:GetService("HttpService")
local Lighting = game:GetService("Lighting")
local Workspace = game:GetService("Workspace")
local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Configuration = require(ReplicatedStorage.RobloxPotatoGraphics.Configuration)
local Net = require(ReplicatedStorage.RobloxPotatoGraphics.Net)

local applyProfileEvent = Net.getApplyProfileEvent()
local statusChangedEvent = Net.getStatusChangedEvent()
local requestProfileFunction = Net.getRequestProfileFunction()

-- ============================================================
-- CONFIG YOU EDIT
-- ============================================================
local DEFAULT_PROFILE = "Potato"

-- Leave this as "" to run fully offline (no sync, no HttpService calls at
-- all -- the in-game menu still works perfectly). Set it to a raw JSON URL
-- (e.g. a GitHub Gist "raw" link) to enable live sync.
-- Expected JSON body: {"profile":"Extreme Potato"}
local SYNC_URL = ""
local SYNC_POLL_SECONDS = 30

-- ============================================================
-- WORLD-LEVEL APPLICATION (shared by every player on this server)
-- ============================================================
local currentWorldProfile = nil

local function applyWorldProfile(profileName)
	local cfg = Configuration.PROFILES[profileName]
	if not cfg then return false end

	Lighting.GlobalShadows = cfg.globalShadows
	Lighting.Technology = cfg.technology

	for _, child in ipairs(Lighting:GetChildren()) do
		if child:IsA("BloomEffect") or child:IsA("SunRaysEffect")
			or child:IsA("DepthOfFieldEffect") or child:IsA("ColorCorrectionEffect") then
			child.Enabled = cfg.postEffectsEnabled
		elseif child:IsA("Atmosphere") then
			child.Enabled = cfg.atmosphereEnabled
		end
	end

	local terrain = Workspace:FindFirstChildOfClass("Terrain")
	if terrain then
		terrain.Decoration = cfg.terrainDecoration
	end

	Workspace.StreamingEnabled = true
	Workspace.StreamingTargetRadius = cfg.streamingTargetRadius
	Workspace.StreamingMinRadius = cfg.streamingMinRadius

	-- Purely decorative effects the developer has explicitly tagged as
	-- safe to disable. We never touch untagged ParticleEmitters/Beams/
	-- Trails, because those could be gameplay-relevant (e.g. a damage
	-- zone's visual). Tag anything cosmetic-only with "PotatoOptionalFX"
	-- in Studio (select the instance -> Tags widget -> add tag).
	for _, inst in ipairs(CollectionService:GetTagged("PotatoOptionalFX")) do
		if inst:IsA("ParticleEmitter") or inst:IsA("Beam") or inst:IsA("Trail")
			or inst:IsA("Smoke") or inst:IsA("Fire") then
			inst.Enabled = cfg.optionalEffectsEnabled
		end
	end

	currentWorldProfile = profileName
	return true
end

-- ============================================================
-- STATUS BROADCAST
-- ============================================================
local function broadcastStatus(state, message)
	-- state is one of: "Connected" | "Syncing" | "Applied" | "Disconnected" | "Error"
	statusChangedEvent:FireAllClients(state, message or "")
end

-- ============================================================
-- PER-PLAYER PERSONAL PROFILE REQUEST (client-only settings)
-- ============================================================
requestProfileFunction.OnServerInvoke = function(player, profileName)
	if not Configuration.isValidProfileName(profileName) then
		return false, "Unknown profile"
	end
	-- Nothing server-side to change here -- SavedQualityLevel and this
	-- player's own UI text scale are entirely client-side. We just
	-- confirm it's a real, known profile and let the calling client
	-- apply it to itself.
	return true, profileName
end

-- ============================================================
-- STARTUP
-- ============================================================
applyWorldProfile(DEFAULT_PROFILE)
applyProfileEvent:FireAllClients(DEFAULT_PROFILE)

if SYNC_URL == "" then
	broadcastStatus("Disconnected", "No sync URL configured -- running on the baked-in default profile ("
		.. DEFAULT_PROFILE .. "). This is expected, not an error.")
else
	task.spawn(function()
		while true do
			broadcastStatus("Syncing", "Checking " .. SYNC_URL)

			local ok, result = pcall(function()
				return HttpService:GetAsync(SYNC_URL)
			end)

			if ok then
				local decodeOk, decoded = pcall(function()
					return HttpService:JSONDecode(result)
				end)

				if decodeOk then
					local sanitized = Configuration.sanitizeRemoteProfile(decoded)
					if sanitized then
						if sanitized ~= currentWorldProfile then
							applyWorldProfile(sanitized)
							applyProfileEvent:FireAllClients(sanitized)
							broadcastStatus("Applied", "Switched to " .. sanitized)
						else
							broadcastStatus("Connected", "Up to date (" .. sanitized .. ")")
						end
					else
						broadcastStatus("Error", "Sync file fetched but did not contain a recognized profile")
					end
				else
					broadcastStatus("Error", "Sync file was not valid JSON")
				end
			else
				broadcastStatus("Error", "Could not reach sync URL: " .. tostring(result))
			end

			task.wait(SYNC_POLL_SECONDS)
		end
	end)
end
