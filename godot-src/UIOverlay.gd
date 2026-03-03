extends CanvasLayer
## UI Overlay system for dialogue, progress bars, and status bubbles

signal choice_made(index: int, text: String)

@onready var dialogue_box = $DialogueBox
@onready var dialogue_text = $DialogueBox/MarginContainer/VBoxContainer/DialogueText
@onready var choices_container = $DialogueBox/MarginContainer/VBoxContainer/ChoicesContainer
@onready var progress_panel = $ProgressPanel
@onready var progress_fill = $ProgressPanel/ProgressFill
@onready var progress_label = $ProgressPanel/ProgressLabel
@onready var status_bubble = $StatusBubble
@onready var status_text = $StatusBubble/StatusText
@onready var action_toast = $ActionToast
@onready var toast_label = $ActionToast/HBoxContainer/ToastLabel

var target_node: Node2D  # For bubble to follow
var typewriter_tween: Tween
var pulse_tween: Tween

func _ready():
	# Start with everything hidden
	dialogue_box.hide()
	progress_panel.hide()
	status_bubble.hide()
	action_toast.hide()

func _process(_delta):
	# Make status bubble follow target
	if target_node and status_bubble.visible:
		var screen_pos = target_node.get_global_transform_with_canvas().origin
		status_bubble.position = screen_pos + Vector2(-20, -50)

# ============================================================================
# DIALOGUE BOX
# ============================================================================

## Show dialogue with optional choice options
func show_dialogue(text: String, options: Array = []) -> void:
	dialogue_text.text = text
	dialogue_text.visible_characters = 0
	dialogue_box.show()

	# Cancel any existing typewriter
	if typewriter_tween:
		typewriter_tween.kill()

	# Typewriter effect
	typewriter_tween = create_tween()
	var char_count = dialogue_text.get_total_character_count()
	var duration = len(text) * 0.02  # 20ms per character
	duration = clamp(duration, 0.1, 3.0)
	typewriter_tween.tween_property(dialogue_text, "visible_characters", char_count, duration)

	# Setup choices if provided
	_setup_choices(options)

func _setup_choices(options: Array) -> void:
	# Get or create choice buttons
	for i in range(4):
		var btn: Button
		if i < choices_container.get_child_count():
			btn = choices_container.get_child(i)
		else:
			btn = Button.new()
			btn.custom_minimum_size = Vector2(100, 24)
			choices_container.add_child(btn)

		if i < options.size():
			btn.text = options[i]
			btn.show()
			# Disconnect any existing connections
			if btn.pressed.is_connected(_on_choice_pressed):
				btn.pressed.disconnect(_on_choice_pressed)
			btn.pressed.connect(_on_choice_pressed.bind(i, options[i]))
		else:
			btn.hide()

	choices_container.visible = options.size() > 0

func _on_choice_pressed(index: int, text: String) -> void:
	choice_made.emit(index, text)
	hide_dialogue()

## Hide the dialogue box
func hide_dialogue() -> void:
	if typewriter_tween:
		typewriter_tween.kill()
	dialogue_box.hide()

## Check if dialogue is visible
func is_dialogue_visible() -> bool:
	return dialogue_box.visible

# ============================================================================
# PROGRESS BAR
# ============================================================================

## Show progress bar with label and percentage
func show_progress(label: String, percent: float) -> void:
	progress_label.text = "%s... %d%%" % [label, int(percent)]

	# Scale the fill bar based on percentage
	progress_fill.scale.x = clamp(percent / 100.0, 0.0, 1.0)

	progress_panel.show()

	# Auto-hide when complete
	if percent >= 100:
		var hide_tween = create_tween()
		hide_tween.tween_interval(0.5)
		hide_tween.tween_callback(hide_progress)

## Hide progress bar
func hide_progress() -> void:
	progress_panel.hide()

## Update progress without changing label
func update_progress(percent: float) -> void:
	progress_fill.scale.x = clamp(percent / 100.0, 0.0, 1.0)
	var current_label = progress_label.text.split("...")[0]
	progress_label.text = "%s... %d%%" % [current_label, int(percent)]

# ============================================================================
# STATUS BUBBLE (follows character)
# ============================================================================

## Show status bubble above target node
func show_status(target: Node2D, status: String) -> void:
	target_node = target
	status_text.text = status
	status_bubble.show()

	# Cancel existing pulse
	if pulse_tween:
		pulse_tween.kill()

	# Pulse animation
	pulse_tween = create_tween().set_loops()
	pulse_tween.tween_property(status_bubble, "modulate:a", 0.7, 0.4)
	pulse_tween.tween_property(status_bubble, "modulate:a", 1.0, 0.4)

## Hide status bubble
func hide_status() -> void:
	if pulse_tween:
		pulse_tween.kill()
	status_bubble.hide()
	target_node = null

# ============================================================================
# ACTION TOAST (brief notifications)
# ============================================================================

## Show a brief action notification
func show_toast(text: String, duration: float = 2.0) -> void:
	toast_label.text = text
	action_toast.show()
	action_toast.modulate.a = 1.0

	var toast_tween = create_tween()
	toast_tween.tween_interval(duration - 0.3)
	toast_tween.tween_property(action_toast, "modulate:a", 0.0, 0.3)
	toast_tween.tween_callback(action_toast.hide)

## Hide toast immediately
func hide_toast() -> void:
	action_toast.hide()
