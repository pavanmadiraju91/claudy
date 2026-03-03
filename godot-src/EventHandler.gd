extends Node
## Main event handler that processes events from Emu and coordinates game responses

@onready var player: CharacterBody2D = $"../Player"
@onready var ui: CanvasLayer = $"../UIOverlay"
@onready var agent_mgr: Node2D = $"../AgentManager"
@onready var destinations: Node2D = $"../Destinations"

var planning_active: bool = false
var current_agent_count: int = 0

func _ready():
	# Wait a frame for all nodes to be ready
	await get_tree().process_frame

	# Setup destination markers for main player
	if destinations and player:
		for marker in destinations.get_children():
			player.destination_markers[marker.name] = marker
		# Trigger entry animation now that destinations are set
		player.start_entry_animation()

	# Connect to JSBridge events
	if JSBridge:
		JSBridge.game_event.connect(_on_game_event)
		# Notify Emu that game is ready
		JSBridge.send_ready()

	# Connect UI choice signal
	if ui:
		ui.choice_made.connect(_on_user_choice)

	print("[EventHandler] Initialized")

# ============================================================================
# EVENT ROUTING
# ============================================================================

func _on_game_event(data: Dictionary) -> void:
	var event_type = data.get("type", "")

	match event_type:
		"ui_instruction":
			_handle_ui_instruction(data)
		"agent_event":
			_handle_agent_event(data)
		"planning":
			_handle_planning(data)
		_:
			print("[EventHandler] Unknown event type: ", event_type)

# ============================================================================
# UI INSTRUCTION HANDLER
# ============================================================================

func _handle_ui_instruction(data: Dictionary) -> void:
	print("[EventHandler] UI instruction received: ", data)

	# Extract payload from the event wrapper
	var payload = data.get("payload", data)

	# Skip noise (spinners, status indicators)
	if payload.get("skip", false):
		return

	# Move main character based on action
	var action = payload.get("character_action", "idle")
	if action and action != "idle":
		_handle_character_action(action)

	# Show UI based on type
	var ui_type = payload.get("ui_type", "")
	var content = payload.get("content", "")
	var options = payload.get("options", [])

	match ui_type:
		"dialogue", "text", "action":
			if content and not content.is_empty():
				ui.show_dialogue(content)
		"choice":
			if content and not content.is_empty():
				ui.show_dialogue(content, options)
		"error":
			if content and not content.is_empty():
				ui.show_dialogue("[color=red]%s[/color]" % content)
		"code":
			# Show brief toast for code blocks
			ui.show_toast("Writing code...", 1.5)

	# Handle hide_status command
	if payload.get("hide_status", false):
		ui.hide_status()
		return

	# Show custom status (emoji from tool) if provided
	var custom_status = payload.get("custom_status", "")
	if custom_status and not custom_status.is_empty():
		ui.show_status(player, custom_status)
		return

	# Show status bubble based on emotion
	var emotion = payload.get("emotion", "neutral")
	if emotion in ["thinking", "focused"]:
		ui.show_status(player, emotion + "...")
	elif emotion == "happy":
		ui.show_status(player, ":)")
	elif emotion == "worried":
		ui.show_status(player, "...")
	elif emotion == "neutral":
		# Don't hide status on neutral - let explicit hide_status handle it
		pass
	else:
		ui.hide_status()

func _handle_character_action(action: String) -> void:
	print("[EventHandler] Character action: ", action)
	match action:
		"walk_to_desk":
			player.move_to_destination("desk")
		"walk_to_cabinet":
			player.move_to_destination("cabinet")
		"walk_to_terminal":
			player.move_to_destination("terminal")
		"walk_to_bookshelf":
			player.move_to_destination("bookshelf")
		"walk_to_door":
			player.move_to_destination("door")
		"walk_to_center":
			player.move_to_destination("center")
		"idle":
			# Stay in place, don't move
			pass
		"celebrate":
			_celebrate()
		"confused":
			_show_confused()
		_:
			# Unknown action, stay where we are
			print("[EventHandler] Unknown action: ", action)

# ============================================================================
# AGENT EVENT HANDLER
# ============================================================================

func _handle_agent_event(data: Dictionary) -> void:
	# Extract payload from the event wrapper
	var payload = data.get("payload", data)

	var agent_type = payload.get("agent_type", "")  # spawn, complete, update
	var agent_id = payload.get("agent_id", "")
	var agent_name = payload.get("agent_name", "Agent")

	match agent_type:
		"spawn":
			# Pick a destination (cycle through available)
			var dest_options = ["desk", "terminal", "cabinet", "bookshelf"]
			var dest = dest_options[agent_mgr.get_agent_count() % dest_options.size()]
			agent_mgr.spawn_agent(agent_id, dest, agent_name)
			ui.show_toast("Agent spawned: " + agent_name, 1.5)

		"complete":
			agent_mgr.despawn_agent(agent_id)

		"update":
			var status = payload.get("status", "working")
			agent_mgr.update_agent_status(agent_id, status)

# ============================================================================
# PLANNING HANDLER
# ============================================================================

func _handle_planning(data: Dictionary) -> void:
	# Extract payload from the event wrapper
	var payload = data.get("payload", data)

	var progress = payload.get("progress", 0)
	var status = payload.get("status", "planning")

	match status:
		"started":
			planning_active = true
			player.move_to_destination("desk")
			# Wait for arrival then show sit animation
			await player.arrived_at_destination
			player.play_special_anim("sit")
			ui.show_progress("Planning", 0)

		"progress":
			ui.show_progress("Planning", progress)

		"complete":
			planning_active = false
			ui.show_progress("Planning", 100)
			await get_tree().create_timer(0.5).timeout
			ui.hide_progress()
			ui.show_dialogue(
				"Plan ready! Would you like to proceed?",
				["Yes, execute", "Show details", "Modify plan"]
			)

# ============================================================================
# USER INPUT
# ============================================================================

func _on_user_choice(index: int, text: String) -> void:
	# Send choice back to Emu
	JSBridge.send_choice(index, text)

# ============================================================================
# ANIMATIONS
# ============================================================================

func _celebrate() -> void:
	# Quick celebration jump animation
	var original_y = player.position.y
	var tween = create_tween()
	tween.tween_property(player, "position:y", original_y - 10, 0.15)
	tween.tween_property(player, "position:y", original_y, 0.15)
	tween.tween_property(player, "position:y", original_y - 5, 0.1)
	tween.tween_property(player, "position:y", original_y, 0.1)

	ui.show_status(player, "done!")
	await get_tree().create_timer(1.5).timeout
	ui.hide_status()

func _show_confused() -> void:
	ui.show_status(player, "???")
	await get_tree().create_timer(1.5).timeout
	ui.hide_status()

# ============================================================================
# DEBUG / TESTING
# ============================================================================

## Test function - can be called from console in standalone mode
func test_ui_instruction() -> void:
	_on_game_event({
		"type": "ui_instruction",
		"payload": {
			"character_action": "walk_to_desk",
			"ui_type": "dialogue",
			"content": "This is a test message from the EventHandler!",
			"emotion": "thinking"
		}
	})

func test_agent_spawn() -> void:
	_on_game_event({
		"type": "agent_event",
		"payload": {
			"agent_type": "spawn",
			"agent_id": "test_" + str(randi() % 1000),
			"agent_name": "Test Agent"
		}
	})

func test_planning() -> void:
	_on_game_event({
		"type": "planning",
		"payload": {
			"status": "started"
		}
	})
	# Simulate progress
	for i in range(0, 101, 10):
		await get_tree().create_timer(0.3).timeout
		_on_game_event({
			"type": "planning",
			"payload": {
				"status": "progress",
				"progress": i
			}
		})
	_on_game_event({
		"type": "planning",
		"payload": {
			"status": "complete"
		}
	})
