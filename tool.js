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

        console.log(this._contentText);
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
            const pageNode = document.body.cloneNode(true);
            const originalNodes = document.body.querySelectorAll('*');
            const clonedNodes = pageNode.querySelectorAll('*');

            // Apply computed styles as inline CSS for every node, as window.getComputedStyle isn't available outside the DOM
            for (let i = 0; i < originalNodes.length; i++) {
                clonedNodes[i].setAttribute('style', window.getComputedStyle(originalNodes[i]).cssText);
            }

            // Get rid of unwanted elements for copy text
            for (const unwantedNode of pageNode.querySelectorAll('script, style, noscript, code')) {
                unwantedNode.remove();
            }

            // Prevent <br> from causing stuck-together words
            for (const brNode of pageNode.querySelectorAll('br')) {
                brNode.outerHTML = brNode.nextSibling && brNode.nextSibling.nodeValue && brNode.nextSibling.nodeValue.trim().length ? ' ' : '\n';
            }

            // Replace images with their alt text if they have one
            for (const imgNode of pageNode.querySelectorAll('img[alt]:not([alt=""])')) {
                imgNode.outerHTML = '\n' + imgNode.alt + '\n';
            }

            // Flex, block or grid display links with that only contain text can most likely be on their own line
            for (const linkNode of pageNode.querySelectorAll('a')) {
                const display = linkNode.style.display.toLowerCase();
                if (display == 'block' || display.indexOf('flex') != -1 || display.indexOf('grid') != -1) {
                    if (![...linkNode.childNodes].filter((node) => { return node.nodeName != '#text'; }).length) {
                        linkNode.innerHTML = "\n\n" + linkNode.innerHTML;
                    }
                }
            }

            // Flex childs are rarely words forming a sentence: break them apart
            for (const node of pageNode.querySelectorAll('*')) {
                if (node.style.display.toLowerCase().indexOf('flex') != -1) {
                    for (const child of node.children) {
                        child.innerHTML = "\n\n" + child.innerHTML;
                    }
                }
            }

            // Simple fix for minified HTML
            pageNode.innerHTML = pageNode.innerHTML.replace(/></g, '> <');

            // Make sure headings are on their own lines - they should be "self-sufficient"
            pageNode.innerHTML = pageNode.innerHTML.replace(/<h([1-6])(.+?)<\/h\1>/g, '\n<h$1$2</h1>\n');

            // Home stretch...
            const rawContent = (pageNode.innerText || '')
                .replace(/(\s{2,})([A-Z0-9])/g, '$1\n$2') // split blocks that seem to contain multiple sentences or standalone blocks
                .replace(/\s{3,}/g, '\n') // break everything into single line blocks
                .replace(/\n.{1,3}\n/g, '\n') // remove tiny words or tokens that are on their own
                .replace(/ {2,}/g, ' ') // replace multiple spaces by a single one
                .replace(/^\s(.+)$/gm, '$1'); // remove spaces at the beginning of lines

            // Get an array of strings without duplicates via the Set constructor and spread operator
            let contentStrings = [...new Set(rawContent.split('\n'))];

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

    async _processText() {
        const apiUrl = process.env.LANGUAGETOOL_API_URL || 'https://languagetool.org/api/v2/check';
        const apiPort = process.env.LANGUAGETOOL_API_PORT || 80;
    }
}

module.exports = Tool;
