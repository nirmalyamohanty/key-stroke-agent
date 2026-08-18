from typing import TypedDict

from langgraph.graph import StateGraph, END

from app.EventModels.events import EventType, KeystrokeEvent
from app.session.state import SessionState


# ==========================================
# Thresholds
# ==========================================

PAUSE_THRESHOLD = 2.0
LATENCY_THRESHOLD = 1.0
BACKSPACE_RATIO_THRESHOLD = 0.2


# ==========================================
# LangGraph State
# ==========================================

class KeystrokeGraphState(TypedDict):

    event: KeystrokeEvent
    session_state: SessionState


# ==========================================
# Node 1: Initialize session
# ==========================================

def initialize_session(state: KeystrokeGraphState):

    session = state["session_state"]
    event = state["event"]

    if session.session_start_timestamp is None:
        session.session_start_timestamp = event.timestamp

    return {
        "session_state": session
    }


# ==========================================
# Node 2: Process event
# ==========================================

def process_event(state: KeystrokeGraphState):

    session = state["session_state"]
    event = state["event"]

    if event.event_type == EventType.KEYPRESS:

        session.total_keystrokes += 1
        session.total_inserted_characters += event.character_count

    elif event.event_type == EventType.BACKSPACE:

        session.total_backspaces += 1
        session.total_deleted_characters += event.character_count

    elif event.event_type == EventType.DELETE:

        session.total_deletes += 1
        session.total_deleted_characters += event.character_count

    elif event.event_type == EventType.PASTE:

        session.total_inserted_characters += event.character_count

    return {
        "session_state": session
    }


# ==========================================
# Node 3: Calculate latency
# ==========================================

def calculate_latency(state: KeystrokeGraphState):

    session = state["session_state"]
    event = state["event"]

    if session.last_event_timestamp is not None:

        latency = (
            event.timestamp
            - session.last_event_timestamp
        )

        session.last_latency = latency

    return {
        "session_state": session
    }


# ==========================================
# Node 4: Detect pause
# ==========================================

def detect_pause(state: KeystrokeGraphState):

    session = state["session_state"]

    if (
        session.last_latency is not None
        and session.last_latency > PAUSE_THRESHOLD
    ):

        session.pause_detected = True
        session.last_pause_duration = session.last_latency

    else:

        session.pause_detected = False
        session.last_pause_duration = None

    return {
        "session_state": session
    }


# ==========================================
# Node 5: Calculate backspace ratio
# ==========================================

def calculate_backspace_ratio(state: KeystrokeGraphState):

    session = state["session_state"]

    if session.total_keystrokes > 0:

        session.backspace_ratio = (
            session.total_backspaces
            / session.total_keystrokes
        )

    return {
        "session_state": session
    }


# ==========================================
# Node 6: Calculate struggle score
# ==========================================

def calculate_struggle_score(state: KeystrokeGraphState):

    session = state["session_state"]

    score = 0.0

    if session.backspace_ratio > BACKSPACE_RATIO_THRESHOLD:
        score += 0.4

    if session.pause_detected:
        score += 0.3

    if (
        session.last_latency is not None
        and session.last_latency > LATENCY_THRESHOLD
    ):
        score += 0.3

    session.struggle_score = min(score, 1.0)

    return {
        "session_state": session
    }


# ==========================================
# Node 7: Update timestamp
# ==========================================

def update_timestamp(state: KeystrokeGraphState):

    session = state["session_state"]
    event = state["event"]

    session.last_event_timestamp = event.timestamp

    return {
        "session_state": session
    }


# ==========================================
# Build the LangGraph Agent
# ==========================================

workflow = StateGraph(KeystrokeGraphState)


workflow.add_node(
    "initialize_session",
    initialize_session
)

workflow.add_node(
    "process_event",
    process_event
)

workflow.add_node(
    "calculate_latency",
    calculate_latency
)

workflow.add_node(
    "detect_pause",
    detect_pause
)

workflow.add_node(
    "calculate_backspace_ratio",
    calculate_backspace_ratio
)

workflow.add_node(
    "calculate_struggle_score",
    calculate_struggle_score
)

workflow.add_node(
    "update_timestamp",
    update_timestamp
)


# Entry point

workflow.set_entry_point(
    "initialize_session"
)


# Define agent flow

workflow.add_edge(
    "initialize_session",
    "process_event"
)

workflow.add_edge(
    "process_event",
    "calculate_latency"
)

workflow.add_edge(
    "calculate_latency",
    "detect_pause"
)

workflow.add_edge(
    "detect_pause",
    "calculate_backspace_ratio"
)

workflow.add_edge(
    "calculate_backspace_ratio",
    "calculate_struggle_score"
)

workflow.add_edge(
    "calculate_struggle_score",
    "update_timestamp"
)

workflow.add_edge(
    "update_timestamp",
    END
)


# Compile the agent

keystroke_graph = workflow.compile()