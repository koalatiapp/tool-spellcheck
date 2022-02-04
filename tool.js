"use strict";

const { ResultBuilder, priorities } = require("@koalati/result-builder");
const extractDomContent = require("extract-dom-content");
const LanguageDetect = require("languagedetect");
const axios = require("axios");
const escapeMarkdown = require("markdown-escape");

class Tool {
	constructor({ page }) {
		this.page = page;

		/** @type {ResultBuilder} */
		this.builder = new ResultBuilder();
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
		return this.builder.toArray();
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
				if (string.replace(/[0-9.,%$:]/g, "").length < 3) { return false; }
				if (!/[a-zA-Z]{2,}/.test(string)) { return false; }

				return true;
			});

			return contentStrings.join("\n");
		});
	}

	_detectLanguage() {
		const langDetector = new LanguageDetect();
		langDetector.setLanguageType("iso2");

		let detectedLanguages = langDetector.detect(this._contentText);

		for (const result of detectedLanguages) {
			if (result[0] && result[0] != "la") {
				return result[0];
			}
		}

		return null;
	}

	_spellcheck(lang) {
		const apiHost = process.env.LANGUAGETOOL_API_HOST || "http://languagetool.org";
		const apiPath = process.env.LANGUAGETOOL_API_PATH || "/api/v2/check";
		const apiPort = process.env.LANGUAGETOOL_API_PORT || 80;

		// eslint-disable-next-line no-undef
		return new Promise((resolve, reject) => {
			axios.get(`${apiHost}:${apiPort}${apiPath}`, {
				params: {
					language: lang,
					text: this._contentText,
				}
			}).then(response => {
				resolve(typeof response.data == "string" ? JSON.parse(response.data) : response.data);
			}).catch(error => {
				if (error.response && typeof error.response.data == "string" && error.response.data.indexOf("Error: ") === 0) {
					reject("Spellchecking request error: " + error.response.data.substr(7));
				}

				reject("Could not connect to the spellchecking server: " + error);
			});
		});
	}

	_prepareResults() {
		const tests = {};
		const testDescriptions = [];

		for (const result of this._languageToolResponse.matches || []) {
			if (this._detectMissingCommaFalseNegative(result) ||
				this._incorrectWordIsProperNoun(result)) {
				continue;
			}

			if (typeof tests[result.rule.category.id] == "undefined") {
				tests[result.rule.category.id] = this.builder.newTest(result.rule.category.id)
					.setTitle(result.rule.category.name)
					.addTableRow(["Original text", "Suggested text"])
					.setScore(0)
					.setWeight(1)
					.addRecommendation(
						`Fix the ${result.rule.category.name.toLowerCase()} issues in your website's content`,
						{},
						this._getRulePriority(result)
					);

				testDescriptions[result.rule.category.id] = ["Checks if your page's content contains spelling mistakes, grammar errors, redundancies, and any other mistakes.\n"];
			}

			const test = tests[result.rule.category.id];

			// Add the table row
			test.addTableRow([
				this._higlightContext(result),
				this._extractSuggestedText(result)
			]);

			// Add the rule's instructions if it hasn't been already
			if (testDescriptions[result.rule.category.id].indexOf("- " + result.message) == -1) {
				testDescriptions[result.rule.category.id].push("- " + result.message);
			}
		}

		for (const testKey in testDescriptions) {
			tests[testKey].setDescription(testDescriptions[testKey].join("\n"));
		}
	}

	_getRulePriority(result) {
		switch (result.rule.issueType) {
		case "misspelling":
		case "grammar":
		case "duplication":
			return priorities.ESSENTIAL;
		}

		return priorities.OPTIMIZATION;
	}

	_higlightContext(result) {
		const context = result.context.text.substr(result.context.offset, result.context.length);
		const whitespaceBefore = context.replace(/^(\s*).*$/, "$1");
		const whitespaceAfter = context.replace(/^.*?(\s*)$/, "$1");

		return escapeMarkdown(result.context.text.substr(0, result.context.offset)) +
			whitespaceBefore + "**" + escapeMarkdown(context.trim()) + "**" + whitespaceAfter +
            escapeMarkdown(result.context.text.substr(result.context.offset + result.context.length));
	}

	_extractSuggestedText(result) {
		try {
			const original = result.context.text;
			const suggestion = result.replacements[0].value;
			const replacement = escapeMarkdown(original.substr(0, result.context.offset)) +
				(suggestion ? ("**" + escapeMarkdown(suggestion) + "**") : "") +
				escapeMarkdown(original.substr(result.context.offset + result.context.length));

			return replacement;
		} catch (err) {
			return "N/A";
		}
	}

	/**
	 * Detects false-positive cases of "missing comma".
	 *
	 * @param {object} result
	 * @param {object} result.rule
	 * @param {string} result.rule.id
	 * @param {integer} result.offset
	 * @param {integer} result.length
	 * @returns {boolean} Returns true if the result is a false positive
	 */
	_detectMissingCommaFalseNegative(result) {
		if (result.rule.id.indexOf("MISSING_COMMA") == -1) {
			return false;
		}

		const stringBefore = this._contentText.substr(0, result.offset).replace(/^(.*)[\t\r ]+$/gm, "$1");
		const stringAfter = this._contentText.substr(result.offset + result.length).replace(/^[\t\r ]+(.*)$/gm, "$1");

		return stringAfter.indexOf("\n") == 0 || stringBefore.indexOf("\n") == stringBefore.length - 1;
	}

	/**
	 * Detects whether the subject of a result looks like a proper noun.
	 *
	 * @param {object} result
	 * @param {object} result.rule
	 * @param {string} result.rule.id
	 * @param {integer} result.offset
	 * @param {integer} result.length
	 * @returns {boolean} Returns true if the subject is a proper noun
	 */
	_incorrectWordIsProperNoun(result) {
		const subject = this._contentText.substr(0, result.offset);

		return /^([A-Z\u00C0-\u00DC]+[^\s]+\s*)+$/.test(subject);
	}
}

module.exports = Tool;
