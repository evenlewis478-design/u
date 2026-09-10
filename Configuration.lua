--[[
	Configuration.lua  (ModuleScript)
	Location: ReplicatedStorage > RobloxPotatoGraphics > Configuration

	Single source of truth for every profile's real, applicable settings.
	Every field here maps to a real, documented Roblox property that this
	system actually sets. Nothing in this table is decorative.
]]

local Configuration = {}

-- Enum.SavedQualitySetting has Automatic + QualityLevel1..21.
-- We map our five presets onto a spread across that real range.
Configuration.QUALITY_LEVEL_BY_PROFILE = {
	Normal          = Enum.SavedQualitySetting.Automatic,
	Low             = Enum.SavedQualitySetting.QualityLevel14,
	Potato          = Enum.SavedQualitySetting.QualityLevel8,
	["Extreme Potato"]  = Enum.SavedQualitySetting.QualityLevel3,
	["Absolute Potato"] = Enum.SavedQualitySetting.QualityLevel1,
}

-- World-level settings (Lighting/Workspace/Terrain). These are set on the
-- SERVER and replicate to every client automatically -- this is normal
-- Roblox replication, not a fake sync.
Configuration.PROFILES = {
	Normal = {
		globalShadows = true,
		technology = Enum.Technology.ShadowMap,
		postEffectsEnabled = true,
		atmosphereEnabled = true,
		terrainDecoration = true,
		streamingTargetRadius = 1024,
		streamingMinRadius = 512,
		optionalEffectsEnabled = true, -- tagged decorative ParticleEmitters/Beams/Trails
		textScale = 1.0,
	},
	Low = {
		globalShadows = true,
		technology = Enum.Technology.ShadowMap,
		postEffectsEnabled = true,
		atmosphereEnabled = true,
		terrainDecoration = true,
		streamingTargetRadius = 768,
		streamingMinRadius = 384,
		optionalEffectsEnabled = true,
		textScale = 1.0,
	},
	Potato = {
		globalShadows = false,
		technology = Enum.Technology.Compatibility,
		postEffectsEnabled = false,
		atmosphereEnabled = true,
		terrainDecoration = false,
		streamingTargetRadius = 512,
		streamingMinRadius = 256,
		optionalEffectsEnabled = false,
		textScale = 1.1,
	},
	["Extreme Potato"] = {
		globalShadows = false,
		technology = Enum.Technology.Compatibility,
		postEffectsEnabled = false,
		atmosphereEnabled = false,
		terrainDecoration = false,
		streamingTargetRadius = 384,
		streamingMinRadius = 192,
		optionalEffectsEnabled = false,
		textScale = 1.25,
	},
	["Absolute Potato"] = {
		globalShadows = false,
		technology = Enum.Technology.Voxel,
		postEffectsEnabled = false,
		atmosphereEnabled = false,
		terrainDecoration = false,
		streamingTargetRadius = 256,
		streamingMinRadius = 128,
		optionalEffectsEnabled = false,
		textScale = 1.4,
	},
}

Configuration.PROFILE_NAMES = { "Normal", "Low", "Potato", "Extreme Potato", "Absolute Potato" }

-- Everything Roblox does NOT let a game control, shown to the user as
-- "Manual Roblox Setting" instead of silently no-op'd.
Configuration.MANUAL_ONLY_SETTINGS = {
	"Overall app render resolution / display scaling",
	"V-Sync / frame rate cap",
	"Fullscreen toggle",
	"Texture quality (asset-level, not runtime-scriptable)",
	"Global OS-level UI text size (outside this experience's own GUIs)",
}

-- ============================================================
-- Validation: never trust a fetched/remote value blindly.
-- ============================================================
function Configuration.isValidProfileName(name)
	if type(name) ~= "string" then return false end
	for _, n in ipairs(Configuration.PROFILE_NAMES) do
		if n == name then return true end
	end
	return false
end

-- Clamp a sync payload down to ONLY known-safe fields with sane bounds.
-- Anything unexpected in the payload is dropped, not executed.
function Configuration.sanitizeRemoteProfile(raw)
	if type(raw) ~= "table" then return nil end
	local name = raw.profile
	if not Configuration.isValidProfileName(name) then return nil end
	-- The remote payload can only ever *select* one of our known, local
	-- presets by name. It cannot inject arbitrary property values. This is
	-- the core anti-tamper rule: a compromised or malicious JSON endpoint
	-- can pick "Potato" or "Absolute Potato" -- nothing else.
	return name
end

return Configuration
