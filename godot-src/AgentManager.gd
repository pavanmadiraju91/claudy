extends Node2D
## Manages spawning and despawning of agent clones for multi-agent visualization

const PLAYER_SCENE = preload("res://Player.tscn")

var active_agents: Dictionary = {}  # agent_id -> Node2D
var spawn_point: Marker2D
var destinations: Dictionary = {}  # name -> Marker2D
var used_destinations: Array = []  # Track which destinations are in use

signal agent_spawned(agent_id: String)
signal agent_arrived(agent_id: String, destination: String)
signal agent_despawned(agent_id: String)

func _ready():
	# Get spawn point and destinations from parent scene
	var dest_node = get_parent().get_node_or_null("Destinations")
	if dest_node:
		for marker in dest_node.get_children():
			destinations[marker.name] = marker
		if destinations.has("door"):
			spawn_point = destinations["door"]

# ============================================================================
# SPAWN AGENT
# ============================================================================

## Spawn a new agent clone that walks to a destination
func spawn_agent(agent_id: String, dest_name: String = "", task_label: String = "Agent") -> Node2D:
	# Don't spawn duplicate agents
	if active_agents.has(agent_id):
		return active_agents[agent_id]

	# Auto-assign destination if not specified
	if dest_name.is_empty() or not destinations.has(dest_name):
		dest_name = _get_free_destination()

	var agent = PLAYER_SCENE.instantiate()
	agent.name = "Agent_" + agent_id
	add_child(agent)

	# Copy destination markers to the agent
	agent.destination_markers = destinations

	# Start at spawn point (door)
	if spawn_point:
		agent.position = spawn_point.global_position
	else:
		agent.position = Vector2(305, 200)

	# Start invisible for pop-in effect
	agent.scale = Vector2.ZERO
	agent.modulate.a = 0

	# Pop-in animation
	var tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property(agent, "scale", Vector2.ONE, 0.3).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	tween.tween_property(agent, "modulate:a", 1.0, 0.2)

	# Walk to destination after pop-in
	tween.chain().tween_callback(func():
		agent.move_to_destination(dest_name)
		# Connect arrival signal
		if not agent.arrived_at_destination.is_connected(_on_agent_arrived):
			agent.arrived_at_destination.connect(_on_agent_arrived.bind(agent_id))
	)

	active_agents[agent_id] = agent
	used_destinations.append(dest_name)

	# Add status label above agent
	_add_status_label(agent, task_label)

	agent_spawned.emit(agent_id)
	return agent

func _on_agent_arrived(dest_name: String, agent_id: String) -> void:
	agent_arrived.emit(agent_id, dest_name)

func _add_status_label(agent: Node2D, text: String) -> void:
	var label = Label.new()
	label.name = "StatusLabel"
	label.text = text
	label.position = Vector2(-24, -32)
	label.add_theme_font_size_override("font_size", 8)
	label.add_theme_color_override("font_color", Color(1, 1, 1, 0.9))
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.7))
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 1)
	agent.add_child(label)

## Get a free destination that isn't being used
func _get_free_destination() -> String:
	var options = ["desk", "terminal", "cabinet", "bookshelf"]
	for opt in options:
		if opt not in used_destinations and destinations.has(opt):
			return opt
	# If all are used, cycle through
	var idx = active_agents.size() % options.size()
	return options[idx]

# ============================================================================
# DESPAWN AGENT
# ============================================================================

## Despawn an agent with poof animation
func despawn_agent(agent_id: String) -> void:
	if not active_agents.has(agent_id):
		return

	var agent = active_agents[agent_id]

	# Remove from used destinations
	if agent.pending_destination in used_destinations:
		used_destinations.erase(agent.pending_destination)

	# Stop any current movement
	agent.stop_auto_move()

	# Walk back to door first (if far from spawn)
	var dist_to_door = 0.0
	if spawn_point:
		dist_to_door = agent.position.distance_to(spawn_point.global_position)

	if dist_to_door > 50 and destinations.has("door"):
		agent.move_to_destination("door")
		# Wait for arrival then do poof
		await agent.arrived_at_destination
		await get_tree().create_timer(0.1).timeout

	# Poof animation
	var tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property(agent, "scale", Vector2.ZERO, 0.3).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_BACK)
	tween.tween_property(agent, "modulate:a", 0.0, 0.2)
	tween.tween_property(agent, "position:y", agent.position.y - 20, 0.3)

	tween.chain().tween_callback(func():
		active_agents.erase(agent_id)
		agent.queue_free()
		agent_despawned.emit(agent_id)
	)

## Immediately despawn an agent (no animation)
func despawn_agent_immediate(agent_id: String) -> void:
	if not active_agents.has(agent_id):
		return

	var agent = active_agents[agent_id]
	active_agents.erase(agent_id)
	agent.queue_free()
	agent_despawned.emit(agent_id)

# ============================================================================
# UPDATE AGENT
# ============================================================================

## Update an agent's status label
func update_agent_status(agent_id: String, status: String) -> void:
	if active_agents.has(agent_id):
		var agent = active_agents[agent_id]
		var label = agent.get_node_or_null("StatusLabel")
		if label:
			label.text = status

## Move agent to a new destination
func move_agent_to(agent_id: String, dest_name: String) -> void:
	if active_agents.has(agent_id) and destinations.has(dest_name):
		var agent = active_agents[agent_id]
		agent.move_to_destination(dest_name)

# ============================================================================
# UTILITIES
# ============================================================================

## Despawn all agents
func despawn_all() -> void:
	for id in active_agents.keys():
		despawn_agent_immediate(id)
	used_destinations.clear()

## Get number of active agents
func get_agent_count() -> int:
	return active_agents.size()

## Check if agent exists
func has_agent(agent_id: String) -> bool:
	return active_agents.has(agent_id)

## Get agent node by ID
func get_agent(agent_id: String) -> Node2D:
	return active_agents.get(agent_id)
