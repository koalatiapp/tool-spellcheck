'use strict';

const LanguageDetect = require('languagedetect');

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
        return await this.page.evaluate(() => {
            // we'll be doing some manipulation on the nodes, so we keep it non-destructive
            const pageNode = document.body.cloneNode(true);

            // get rid of unwanted elements for copy text
            for (const unwantedNode of pageNode.querySelectorAll('script, style, noscript, code')) {
                unwantedNode.remove();
            }

            // prevent <br> from causing stuck-together words
            for (const brNode of pageNode.querySelectorAll('br')) {
                brNode.outerHTML = " ";
            }

            // flex childs are rarely words forming a sentence: break them apart
            for (const node of pageNode.querySelectorAll('*')) {
                if (window.getComputedStyle(node).display.toLowerCase().indexOf('flex') != -1) {
                    for (const child of node.children) {
                        child.outerHTML = "\n\n" + child.outerHTML;
                    }
                }
            }

            // simple fix for minified HTML
            pageNode.innerHTML = pageNode.innerHTML.replace(/></g, '> <');

            // home stretch...
            const content = (pageNode.innerText || '')
                .replace(/(\s{2,})([A-Z0-9])/g, '$1\n$2') // split blocks that seem to contain multiple sentences or standalone blocks
                .replace(/\s{3,}/g, '\n') // break everything into single line blocks
                .replace(/\n.{1,3}\n/g, '\n'); // remove tiny words or tokens that are on their own

            return content;
        });
    }

    _detectLanguage() {
        const langDetector = new LanguageDetect();
        langDetector.setLanguageType('iso2');

        let detectedLanguages = langDetector.detect(this._contentText);

        for (const result of detectLanguages) {
            if (result[0] && result[0] != 'la') {
                return result[0];
            }
        }

        return null;
    }
}

module.exports = Tool;
