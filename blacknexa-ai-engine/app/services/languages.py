"""The 19-language catalogue.

Ported verbatim from `blacknexa-backend/src/services/i18n.service.ts`, including
the list order — Node's `/platform/news/locales` and the app's language picker
both render it as-is.

Coverage is deliberate: the largest global reading populations plus the African
and diaspora languages the platform specifically serves (Swahili, Yoruba, Amharic).
"""

from __future__ import annotations

from app.schemas.news import SupportedLanguage

SUPPORTED_LANGUAGES: list[SupportedLanguage] = [
    SupportedLanguage(code="en", nativeName="English", englishName="English", locale="en-US", flag="🇺🇸"),
    SupportedLanguage(code="es", nativeName="Español", englishName="Spanish", locale="es-ES", flag="🇪🇸"),
    SupportedLanguage(code="pt", nativeName="Português", englishName="Portuguese", locale="pt-BR", flag="🇧🇷"),
    SupportedLanguage(code="fr", nativeName="Français", englishName="French", locale="fr-FR", flag="🇫🇷"),
    SupportedLanguage(code="de", nativeName="Deutsch", englishName="German", locale="de-DE", flag="🇩🇪"),
    SupportedLanguage(code="it", nativeName="Italiano", englishName="Italian", locale="it-IT", flag="🇮🇹"),
    SupportedLanguage(code="nl", nativeName="Nederlands", englishName="Dutch", locale="nl-NL", flag="🇳🇱"),
    SupportedLanguage(code="ru", nativeName="Русский", englishName="Russian", locale="ru-RU", flag="🇷🇺"),
    SupportedLanguage(code="tr", nativeName="Türkçe", englishName="Turkish", locale="tr-TR", flag="🇹🇷"),
    SupportedLanguage(
        code="ar", nativeName="العربية", englishName="Arabic", locale="ar-SA", flag="🇸🇦", rtl=True
    ),
    SupportedLanguage(
        code="zh", nativeName="中文", englishName="Chinese (Simplified)", locale="zh-CN", flag="🇨🇳"
    ),
    SupportedLanguage(code="ja", nativeName="日本語", englishName="Japanese", locale="ja-JP", flag="🇯🇵"),
    SupportedLanguage(code="ko", nativeName="한국어", englishName="Korean", locale="ko-KR", flag="🇰🇷"),
    SupportedLanguage(code="hi", nativeName="हिन्दी", englishName="Hindi", locale="hi-IN", flag="🇮🇳"),
    SupportedLanguage(
        code="vi", nativeName="Tiếng Việt", englishName="Vietnamese", locale="vi-VN", flag="🇻🇳"
    ),
    SupportedLanguage(
        code="id", nativeName="Bahasa Indonesia", englishName="Indonesian", locale="id-ID", flag="🇮🇩"
    ),
    SupportedLanguage(code="sw", nativeName="Kiswahili", englishName="Swahili", locale="sw-KE", flag="🇰🇪"),
    SupportedLanguage(code="yo", nativeName="Yorùbá", englishName="Yoruba", locale="yo-NG", flag="🇳🇬"),
    SupportedLanguage(code="am", nativeName="አማርኛ", englishName="Amharic", locale="am-ET", flag="🇪🇹"),
]

LANGUAGE_BY_CODE: dict[str, SupportedLanguage] = {lang.code: lang for lang in SUPPORTED_LANGUAGES}


def is_supported(code: str | None) -> bool:
    """True when the code is in the catalogue."""
    return bool(code) and code in LANGUAGE_BY_CODE


def get_language(code: str) -> SupportedLanguage | None:
    return LANGUAGE_BY_CODE.get(code)


def translation_targets() -> list[str]:
    """Every non-English code — the pre-translation target set.

    Ports `i18nService.translationTargets`.
    """
    return [lang.code for lang in SUPPORTED_LANGUAGES if lang.code != "en"]
