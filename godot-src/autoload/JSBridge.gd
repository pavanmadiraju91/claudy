extends Node
## JavaScript Bridge for communication with Emu (Electron parent window)
## Handles bidirectional messaging between Godot HTML5 and the Electron wrapper

signal game_event(data: Dictionary)

var js_callback: JavaScriptObject

func _ready():
	if OS.has_feature("web"):
		_setup_js_bridge()
	else:
		print("[JSBridge] Not running in web mode, JS bridge disabled")

func _setup_js_bridge() -> void:
	# Create callback that JS can invoke
	js_callback = JavaScriptBridge.create_callback(_on_js_message)

	# Register the callback on window object
	var window = JavaScriptBridge.get_interface("window")
	window.godotReceiveMessage = js_callback

	print("[JSBridge] Bridge initialized, ready to receive messages")

func _on_js_message(args: Array) -> void:
	if args.is_empty():
		return

	var json_str = args[0]
	var data = JSON.parse_string(json_str)

	if data and data is Dictionary:
		print("[JSBridge] Received: ", data.get("type", "unknown"))
		game_event.emit(data)
	else:
		push_warning("[JSBridge] Failed to parse message: " + str(json_str))

# ============================================================================
# SEND TO EMU
# ============================================================================

## Send a message back to Emu (Electron parent window)
func send_to_emu(event_type: String, payload: Dictionary = {}) -> void:
	if not OS.has_feature("web"):
		print("[JSBridge] Would send to Emu: ", event_type, " - ", payload)
		return

	var message = {
		"type": event_type,
		"payload": payload
	}
	var json_str = JSON.stringify(message)

	# Use postMessage to send to parent window
	var js_code = "window.parent.postMessage(%s, '*')" % json_str
	JavaScriptBridge.eval(js_code)

## Send user's choice selection back to Emu
func send_choice(index: int, text: String) -> void:
	send_to_emu("user_choice", {
		"index": index,
		"text": text
	})

## Notify Emu that game is ready
func send_ready() -> void:
	send_to_emu("game_ready", {})

## Send game state update
func send_state(state: Dictionary) -> void:
	send_to_emu("game_state", state)
