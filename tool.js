'use strict';

const extractDomContent = require('extract-dom-content');
const LanguageDetect = require('languagedetect');
const axios = require('axios');

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

        const response = await this._spellcheck(lang);
        console.log(response);
    }

    get results() {
        return [
            {
                'uniqueName': 'your_test_unique_name', // a test name that is unique within your tool. this will be prefixed with your tool's name to generate a Koalati-wide unique name for this test.
                'title': 'Your test\'s user-friendly title',
                'description': 'Your test\'s user-friendly description.', // This can be a static description of what your test looks for, or a dynamic one that describes the results.
                'weight': 1, // the weight of this test's score as a float. the sum of the weights of all your results should be 1.0
                'score': 1, // the score obtained as a float: 0.5 is 50%, 1.0 is 100%, etc.
                // 'snippets': [], // a one-dimensional array of strings and/or ElementHandle that can be represented as code snippets in Koalati's results
                // 'table': [], // a two-dimensional array of data that will be represented as a table in Koalati's results. The first row should contain the column's headings.
                // 'recommendations': '', // a string or an array of string that gives recommendations, telling the user what can be done to improve the page
            },
            // ...
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
}

module.exports = Tool;
