import pytest

from wingman.providers import NoProviderConfigured, ProviderError

from .fakes import FakeProvider

MSG = [{"role": "user", "content": "hi"}]


async def collect(handle):
    return "".join([c async for c in handle])


async def test_streams_from_primary(make_router):
    router = make_router({"groq": FakeProvider("groq", ["a", "b"])})
    handle = router.stream(MSG)
    assert await collect(handle) == "ab"
    assert handle.provider == "groq" and handle.fell_back_from is None and handle.ttft_ms is not None


async def test_falls_back_before_first_token(make_router):
    router = make_router(
        {"groq": FakeProvider("groq", fail_before="rate limited"), "gemini": FakeProvider("gemini", ["ok"])}
    )
    handle = router.stream(MSG)
    assert await collect(handle) == "ok"
    assert handle.provider == "gemini" and handle.fell_back_from == "groq"


async def test_never_falls_back_mid_stream(make_router):
    second = FakeProvider("gemini", ["should not appear"])
    router = make_router({"groq": FakeProvider("groq", ["part", "ial", "x"], fail_after=2), "gemini": second})
    handle = router.stream(MSG)
    got = []
    with pytest.raises(ProviderError):
        async for c in handle:
            got.append(c)
    assert "".join(got) == "partial"
    assert second.calls == []


async def test_fallback_can_be_disabled(make_router):
    router = make_router(
        {"groq": FakeProvider("groq", fail_before="down"), "gemini": FakeProvider("gemini")}, fallback=False
    )
    with pytest.raises(ProviderError, match="down"):
        await collect(router.stream(MSG))


async def test_no_provider_configured(make_router):
    router = make_router({})
    with pytest.raises(NoProviderConfigured):
        await collect(router.stream(MSG))


async def test_usage_is_recorded(make_router, db):
    router = make_router({"groq": FakeProvider("groq", fail_before="boom"), "gemini": FakeProvider("gemini")})
    await collect(router.stream(MSG, purpose="answer"))
    summary = await router.usage.summary()
    by_provider = {m["provider"]: m for m in summary["models"]}
    assert by_provider["groq"]["errors"] == 1
    assert by_provider["gemini"]["requests"] == 1 and by_provider["gemini"]["output_tokens"] == 2
    assert summary["recent_errors"][0]["error"] == "boom"


async def test_selected_model_is_used(make_router):
    fake = FakeProvider("groq")
    router = make_router({"groq": fake})
    router.runtime.config.model = "custom-model"
    await collect(router.stream(MSG))
    assert fake.calls[0][1].model == "custom-model"
    await collect(router.stream(MSG, fast=True))
    assert fake.calls[1][1].model == "openai/gpt-oss-20b"
