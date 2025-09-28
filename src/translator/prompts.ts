import { BaseChatModel } from '@langchain/core/language_models/chat_models';

// --- 模板定義 ---

const baseTemplate = `
{style_guide}

In order to let you understand the context, below is the full original document, followed by the specific section you need to translate.

<!-- FULL_CONTEXT_START -->
{full_context}
<!-- FULL_CONTEXT_END -->

Please translate ONLY the following section into Traditional Chinese. Do not output anything else, just the translated text of this section.

Section to translate:

<!-- SECTION_TO_TRANSLATE_START -->
{section_to_translate}
<!-- SECTION_TO_TRANSLATE_END -->
`;

const preambleTemplate = `
{style_guide}

Please ensure that the titles are translated consistently based on the table of contents in the preamble. Here is the translated preamble for your reference:
<!-- PREAMBLE_START -->
{preamble_context}
<!-- PREAMBLE_END -->

In order to let you understand the context, below is the full original document, followed by the specific section you need to translate.

<!-- FULL_CONTEXT_START -->
{full_context}
<!-- FULL_CONTEXT_END -->

Please translate ONLY the following section into Traditional Chinese. Do not output anything else, just the translated text of this section.

Section to translate:

<!-- SECTION_TO_TRANSLATE_START -->
{section_to_translate}
<!-- SECTION_TO_TRANSLATE_END -->
`;

const baseRetryTemplate = `The previous translation failed validation. Please correct the following errors and re-translate the original text.

Errors:
- {errors}

Remember to follow these style guides:
{style_guide}

For context, here is the full original document:
<!-- FULL_CONTEXT_START -->
{full_context}
<!-- FULL_CONTEXT_END -->

Please translate ONLY the following section into Traditional Chinese. Do not output anything else, just the translated text of this section.

Section to translate:

<!-- SECTION_TO_TRANSLATE_START -->
{section_to_translate}
<!-- SECTION_TO_TRANSLATE_END -->
`;

const preambleRetryTemplate = `The previous translation failed validation. Please correct the following errors and re-translate the original text.

Errors:
- {errors}

Remember to follow these style guides:
{style_guide}

Please also ensure that the titles are translated consistently based on the table of contents in the preamble. Here is the translated preamble for your reference:
<!-- PREAMBLE_START -->
{preamble_context}
<!-- PREAMBLE_END -->

For context, here is the full original document:
<!-- FULL_CONTEXT_START -->
{full_context}
<!-- FULL_CONTEXT_END -->

Please translate ONLY the following section into Traditional Chinese. Do not output anything else, just the translated text of this section.

Section to translate:

<!-- SECTION_TO_TRANSLATE_START -->
{section_to_translate}
<!-- SECTION_TO_TRANSLATE_END -->
`;


// --- 輔助函式 ---

interface GetPromptTemplateArgs {
  isRetry: boolean;
  hasPreamble: boolean;
}

export function getPromptTemplate({ isRetry, hasPreamble }: GetPromptTemplateArgs): string {
  let template: string;

  if (isRetry) {
    template = hasPreamble ? preambleRetryTemplate : baseRetryTemplate;
  } else {
    template = hasPreamble ? preambleTemplate : baseTemplate;
  }

  return template;
}
