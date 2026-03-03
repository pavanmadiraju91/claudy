extends Node2D

@onready var door_cover = $DoorCover
@onready var trigger = $DoorTrigger

var tween: Tween
var original_position_y: float
var original_scale_y: float
var texture_height: float

const TWEEN_DURATION = 0.5

func _ready():
	# Store original values
	original_position_y = door_cover.position.y
	original_scale_y = door_cover.scale.y
	texture_height = door_cover.texture.get_height()

	# Calculate position when hidden (bottom edge stays fixed)
	var hidden_position_y = original_position_y + (texture_height / 2.0) * original_scale_y

	# Start hidden
	door_cover.scale.y = 0.0
	door_cover.position.y = hidden_position_y

func open_door():
	if tween:
		tween.kill()
	tween = create_tween().set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	tween.set_parallel(true)
	tween.tween_property(door_cover, "scale:y", original_scale_y, TWEEN_DURATION)
	tween.tween_property(door_cover, "position:y", original_position_y, TWEEN_DURATION)

func close_door():
	if tween:
		tween.kill()
	var hidden_position_y = original_position_y + (texture_height / 2.0) * original_scale_y
	tween = create_tween().set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	tween.set_parallel(true)
	tween.tween_property(door_cover, "scale:y", 0.0, TWEEN_DURATION)
	tween.tween_property(door_cover, "position:y", hidden_position_y, TWEEN_DURATION)

func _on_door_trigger_body_entered(body):
	if body.name == "Player":
		open_door()

func _on_door_trigger_body_exited(body):
	if body.name == "Player":
		close_door()
