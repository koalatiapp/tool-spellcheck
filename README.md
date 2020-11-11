# Spellcheck tool for Koalati

This is the repository for Koalati's built-in Spellcheck tool. This tool analyzes the content of webpages, looking for grammar and spelling issues in the copy.

## Environment variables

This tool requires the following environment variables:

| **Environment variable** | **Type** | **Default value**           | **Description**                  |
|--------------------------|----------|-----------------------------|----------------------------------|
| LANGUAGETOOL_API_HOST    | String   | `'http://languagetool.org'` | LanguageTool server host name    |
| LANGUAGETOOL_API_PATH    | String   | `'/api/v2/check'`           | LanguageTool spellcheck API path |
| LANGUAGETOOL_API_PORT    | Integer  | `80`                        | LanguageTool server port         |



## Contributing

If you would like to add features, fix bugs or optimize this tool, feel free to fork this repository and submit a pull request.

You can find more information on how to build and test Koalati tools in the [Tool Template's Documentation](https://github.com/koalatiapp/tool-template).
