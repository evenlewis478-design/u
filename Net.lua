--[[
	Net.lua  (ModuleScript)
	Location: ReplicatedStorage > RobloxPotatoGraphics > Net

	Creates/finds the RemoteEvents and RemoteFunction this system uses.
	Both the server script and the client script require this module, so
	the instances only ever get created once (server does it first; the
	client just waits for them).
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Net = {}

local FOLDER_NAME = "RobloxPotatoGraphics"

local function getFolder()
	local folder = ReplicatedStorage:FindFirstChild(FOLDER_NAME)
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = FOLDER_NAME
		folder.Parent = ReplicatedStorage
	end
	return folder
end

-- Fired server -> all clients whenever the active profile changes
-- (world-level settings already applied server-side; this tells clients
-- which client-only settings to apply, e.g. SavedQualityLevel + text scale).
function Net.getApplyProfileEvent()
	local folder = getFolder()
	local ev = folder:FindFirstChild("ApplyProfile")
	if not ev then
		ev = Instance.new("RemoteEvent")
		ev.Name = "ApplyProfile"
		ev.Parent = folder
	end
	return ev
end

-- Fired server -> all clients with the real sync status
-- ("Connected" | "Syncing" | "Applied" | "Disconnected" | "Error", message).
function Net.getStatusChangedEvent()
	local folder = getFolder()
	local ev = folder:FindFirstChild("StatusChanged")
	if not ev then
		ev = Instance.new("RemoteEvent")
		ev.Name = "StatusChanged"
		ev.Parent = folder
	end
	return ev
end

-- Client -> server: "I want to switch MY profile right now."
-- Server validates the name before doing anything with it.
function Net.getRequestProfileFunction()
	local folder = getFolder()
	local fn = folder:FindFirstChild("RequestProfile")
	if not fn then
		fn = Instance.new("RemoteFunction")
		fn.Name = "RequestProfile"
		fn.Parent = folder
	end
	return fn
end

return Net
