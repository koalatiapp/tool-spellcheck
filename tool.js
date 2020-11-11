'use strict';

const extractDomContent = require('extract-dom-content');
const LanguageDetect = require('languagedetect');
const axios = require('axios');
const escapeMarkdown = require('markdown-escape')

class Tool {
    constructor({ page, devices }) {
        this.page = page;
    }

    async run() {
        this._contentText = await this._extractContent();
        const lang = this._detectLanguage();

        if (!lang) {
            throw new Error("The language of the content could not be identified.");
        }

        this._languageToolResponse = await this._spellcheck(lang);
        this._prepareResults();
    }

    get results() {
        return [
            {
                'uniqueName': 'spellcheck',
                'title': 'Content spellcheck',
                'description': 'Checks if your page\'s content contains spelling mistakes, grammar errors, redundancies, and any other mistakes.',
                'weight': 1,
                'score': this._score,
                'recommendations': this._recommandations,
            }
        ];
    }

    async cleanup() {

    }

    async _extractContent() {
        await this.page.addScriptTag({ content: `${extractDomContent}`});
        return await this.page.evaluate(() => {
            let contentStrings = extractDomContent(document.body, {
                returnAsArray: true,
                removeDuplicates: true,
            });

            // Filter out strings that aren't really adequate for spellchecking
            contentStrings = contentStrings.filter((string) => {
                if (string.length < 3) { return false; }
                if (string.replace(/[0-9.,%$:]/g, '').length < 3) { return false; }
                if (!/[a-zA-Z]{2,}/.test(string)) { return false; }

                return true;
            });

            return contentStrings.join('\n');
        });
    }

    _detectLanguage() {
        const langDetector = new LanguageDetect();
        langDetector.setLanguageType('iso2');

        let detectedLanguages = langDetector.detect(this._contentText);

        for (const result of detectedLanguages) {
            if (result[0] && result[0] != 'la') {
                return result[0];
            }
        }

        return null;
    }

    _spellcheck(lang) {
        const apiHost = process.env.LANGUAGETOOL_API_HOST || 'http://languagetool.org';
        const apiPath = process.env.LANGUAGETOOL_API_PATH || '/api/v2/check';
        const apiPort = process.env.LANGUAGETOOL_API_PORT || 80;

        return new Promise((resolve, reject) => {
            axios.get(`${apiHost}:${apiPort}${apiPath}`, {
                params: {
                    language: lang,
                    text: this._contentText,
                }
            }).then(response => {
                resolve(typeof response.data == 'string' ? JSON.parse(response.data) : response.data);
            }).catch(error => {
                if (error.response && typeof error.response.data == 'string' && error.response.data.indexOf('Error: ') === 0) {
                    reject('Spellchecking request error: ' + error.response.data.substr(7));
                }

                reject('Could not connect to the spellchecking server: ' + error);
            });
        });
    }

    _prepareResults() {
        let affectedCharacterCount = 0;
        const originalCharacterCount = this._contentText.length;
        this._recommandations = [];

        for (const result of this._languageToolResponse.matches || []) {
            this._recommandations.push(this._extractRecommandation(result));
            affectedCharacterCount += result.length;
        }

        if (affectedCharacterCount > originalCharacterCount) {
            this._score = 0;
        } else {
            this._score = 1 - (affectedCharacterCount / originalCharacterCount);
        }
    }

    _extractRecommandation(result) {
        // @TODD: Switch to using the recommandation template when it is implemented
        //    - Use `result.rule.id` as unique name
        //    - Use `result.message` with added placecholders as a template
        //    - Use `result.replacements[0]` and `result.sentence` as arguments (with markdown emphasis using `result.offset` and `result.length`)

        let context = escapeMarkdown(result.context.text.substr(0, result.context.offset)) +
            '**' + escapeMarkdown(result.context.text.substr(result.context.offset, result.context.length)) + '**' +
            escapeMarkdown(result.context.text.substr(result.context.offset + result.context.length));
        let recommandation = `${result.message}: \n>${context.replace(/\\n/g, '\n>')}`;

        return recommandation;
    }
}

module.exports = Tool;
