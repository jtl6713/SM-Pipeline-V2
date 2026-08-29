from studio_produce.steps import _is_transient_render_error


def test_render_timeout_is_transient():
    err = "HTTPSConnectionPool(host='render.chicagoshining.com', port=443): Read timed out."
    assert _is_transient_render_error(RuntimeError(err))


def test_permanent_render_error_is_not_transient():
    assert not _is_transient_render_error(RuntimeError("Outputs are stamped but none are eligible"))
