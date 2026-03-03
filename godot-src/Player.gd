extends CharacterBody2D

const TILE_SIZE = 16
const MOVE_SPEED = 4.0  # Tiles per second

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var ray: RayCast2D = $RayCast2D
@onready var nav_agent: NavigationAgent2D = $NavigationAgent2D

var is_moving = false
var target_position: Vector2
var facing_direction = "down"

# Destination markers for programmatic movement
var destination_markers: Dictionary = {}
var auto_moving: bool = false  # True when moving via move_to_destination()

signal arrived_at_destination(dest_name: String)
var pending_destination: String = ""

# Entry animation state
var entry_complete: bool = false

func _ready():
	ray.enabled = true
	ray.add_exception(self)
	sprite.play("idle_down")

	# Configure NavigationAgent2D
	nav_agent.path_desired_distance = 4.0
	nav_agent.target_desired_distance = 4.0
	nav_agent.velocity_computed.connect(_on_velocity_computed)

	# Entry animation will be triggered by Main.gd after destination_markers are set

## Start entry animation: spawn at door invisible, walk to corner office while fading in
func start_entry_animation() -> void:
	if not destination_markers.has("door") or not destination_markers.has("corner_office"):
		push_warning("Entry animation requires 'door' and 'corner_office' destinations")
		entry_complete = true
		return

	# Position at door, invisible
	position = destination_markers["door"].global_position.snapped(Vector2(TILE_SIZE, TILE_SIZE))
	target_position = position
	modulate.a = 0.0
	facing_direction = "down"
	sprite.play("idle_down")

	# Fade in over 1.5 seconds
	var tween = create_tween()
	tween.tween_property(self, "modulate:a", 1.0, 1.5)

	# Walk to corner office
	move_to_destination("corner_office")

	# Mark entry complete when we arrive
	arrived_at_destination.connect(_on_entry_arrived, CONNECT_ONE_SHOT)

func _on_entry_arrived(_dest: String) -> void:
	entry_complete = true

func _on_velocity_computed(_safe_velocity: Vector2) -> void:
	# Used if avoidance is enabled; currently not needed
	pass

func _physics_process(delta):
	if auto_moving:
		_continue_nav_movement(delta)
	elif is_moving:
		_move_towards_target(delta)
	else:
		_handle_input()

func _handle_input():
	var direction = Vector2.ZERO
	var new_facing = facing_direction

	if Input.is_action_pressed("ui_up"):
		direction = Vector2.UP
		new_facing = "up"
	elif Input.is_action_pressed("ui_down"):
		direction = Vector2.DOWN
		new_facing = "down"
	elif Input.is_action_pressed("ui_left"):
		direction = Vector2.LEFT
		new_facing = "left"
	elif Input.is_action_pressed("ui_right"):
		direction = Vector2.RIGHT
		new_facing = "right"

	if direction != Vector2.ZERO:
		facing_direction = new_facing
		_try_move(direction)
	else:
		sprite.play("idle_" + facing_direction)

func _try_move(direction: Vector2):
	ray.target_position = direction * TILE_SIZE
	ray.force_raycast_update()

	if not ray.is_colliding():
		target_position = position + direction * TILE_SIZE
		is_moving = true
		sprite.play("walk_" + facing_direction)
	else:
		sprite.play("idle_" + facing_direction)

func _move_towards_target(delta):
	var move_distance = TILE_SIZE * MOVE_SPEED * delta
	var to_target = target_position - position

	if to_target.length() <= move_distance:
		position = target_position
		is_moving = false
	else:
		position += to_target.normalized() * move_distance

# ============================================================================
# Programmatic Movement API (using NavigationAgent2D)
# ============================================================================

## Move to a named destination marker using NavigationAgent2D pathfinding
func move_to_destination(dest_name: String) -> void:
	if not destination_markers.has(dest_name):
		push_warning("Unknown destination: " + dest_name)
		return

	# Skip if already at or moving to this destination
	if pending_destination == dest_name and auto_moving:
		return

	print("[Player] Moving to: ", dest_name)
	pending_destination = dest_name
	auto_moving = true

	var target = destination_markers[dest_name].global_position
	nav_agent.set_target_position(target)

	# Start walking animation
	_update_facing_to_target(target)
	sprite.play("walk_" + facing_direction)

## Continue navigation movement using NavigationAgent2D
func _continue_nav_movement(delta: float) -> void:
	if nav_agent.is_navigation_finished():
		# Arrived at destination
		auto_moving = false
		var dest = pending_destination
		pending_destination = ""

		# Apply destination's facing direction if specified in metadata
		if destination_markers.has(dest):
			var target_marker = destination_markers[dest]
			if target_marker.has_meta("facing_direction"):
				facing_direction = target_marker.get_meta("facing_direction")

		sprite.play("idle_" + facing_direction)
		arrived_at_destination.emit(dest)
		return

	# Check if path is valid - if not, teleport to destination
	if not nav_agent.is_target_reachable():
		print("[Player] Target unreachable, teleporting to: ", pending_destination)
		if destination_markers.has(pending_destination):
			global_position = destination_markers[pending_destination].global_position
		auto_moving = false
		var dest = pending_destination
		pending_destination = ""
		sprite.play("idle_" + facing_direction)
		arrived_at_destination.emit(dest)
		return

	var next_pos = nav_agent.get_next_path_position()
	var direction = global_position.direction_to(next_pos)

	# Update facing direction based on movement direction
	if abs(direction.x) > abs(direction.y):
		facing_direction = "right" if direction.x > 0 else "left"
	else:
		facing_direction = "down" if direction.y > 0 else "up"

	sprite.play("walk_" + facing_direction)

	# Move toward next path position
	var move_speed = MOVE_SPEED * TILE_SIZE
	velocity = direction * move_speed
	move_and_slide()

## Update facing direction toward a target position
func _update_facing_to_target(target: Vector2) -> void:
	var diff = target - global_position
	if abs(diff.x) > abs(diff.y):
		facing_direction = "right" if diff.x > 0 else "left"
	else:
		facing_direction = "down" if diff.y > 0 else "up"

## Stop auto-movement and return to manual control
func stop_auto_move() -> void:
	auto_moving = false
	pending_destination = ""

## Play a special animation (sit, phone, etc.)
func play_special_anim(anim_name: String) -> void:
	match anim_name:
		"sit":
			if sprite.sprite_frames.has_animation("sit"):
				sprite.play("sit")
			else:
				sprite.play("idle_" + facing_direction)
		"phone":
			if sprite.sprite_frames.has_animation("phone"):
				sprite.play("phone")
			else:
				sprite.play("idle_" + facing_direction)
		_:
			sprite.play("idle_" + facing_direction)

## Check if currently auto-moving
func is_auto_moving() -> bool:
	return auto_moving
