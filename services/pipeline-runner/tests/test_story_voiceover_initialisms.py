import pytest

from studio_produce.story_voiceover import story_text, StoryVoiceoverError

def test_zoo_excerpt_keeps_complete_initialism():
    first = "Zoo Miami is Florida’s largest zoo and the only subtropical one in the continental U.S."
    assert story_text(first + " It’s huge—plan 4 to 6 hours.") == first

def test_question_and_following_sentence():
    assert story_text("Is Santa Monica Pier worth the hype? Save this tip.") == "Is Santa Monica Pier worth the hype?"

def test_never_return_partial_trailing_sentence():
    with pytest.raises(StoryVoiceoverError):
        story_text("This sentence has no closing punctuation")
