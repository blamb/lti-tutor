/**
 * H5P field definitions for the content types added after the first eight:
 * Accordion, Summary, Mark the Words, Single Choice Set, Crossword, Timeline.
 *
 * GENERATED, do not edit by hand. Read from a Moodle 5.0.1 site on 17 Nov
 * 2026: each library's version, its semantics.json and the libraries it
 * loads directly. Same shape as semantics.ts.
 */

import type { SemLibrary } from './semantics.js';

export const MORE_SEMANTICS: Record<string, SemLibrary> = {
 "H5P.Accordion": {
  "version": "1.0",
  "semantics": [
   {
    "name": "panels",
    "type": "list",
    "label": "Panels",
    "entity": "panel",
    "max": 100,
    "min": 1,
    "field": {
     "name": "content",
     "type": "group",
     "label": "Content",
     "importance": "high",
     "entity": "content",
     "fields": [
      {
       "name": "title",
       "type": "text",
       "label": "Title",
       "importance": "high"
      },
      {
       "name": "content",
       "type": "library",
       "label": "Content type",
       "importance": "medium",
       "entity": "content",
       "options": [
        "H5P.AdvancedText 1.1"
       ]
      }
     ]
    }
   },
   {
    "name": "hTag",
    "type": "select",
    "label": "H tags for labels (does not affect the size of the label)",
    "importance": "low",
    "description": "The h tag used on the labels. Normally H2 but if this belongs under an H2 heading use H3. Does not affect the size of the labels, only used for semantical purposes.",
    "options": [
     {
      "value": "h2",
      "label": "H2"
     },
     {
      "value": "h3",
      "label": "H3"
     },
     {
      "value": "h4",
      "label": "H4"
     }
    ],
    "default": "h2"
   }
  ],
  "deps": [
   "FontAwesome 4.5 preloaded"
  ]
 },
 "H5P.Summary": {
  "version": "1.10",
  "semantics": [
   {
    "name": "intro",
    "type": "text",
    "widget": "html",
    "label": "Introduction text",
    "importance": "high",
    "default": "Choose the correct statement.",
    "description": "Will be displayed above the summary task.",
    "enterMode": "p",
    "tags": [
     "strong",
     "em",
     "u",
     "a",
     "ul",
     "ol",
     "h2",
     "h3",
     "hr",
     "pre",
     "code"
    ],
    "common": false
   },
   {
    "name": "summaries",
    "importance": "high",
    "type": "list",
    "widgets": [
     {
      "name": "ListEditor",
      "label": "Default"
     },
     {
      "name": "SummaryTextualEditor",
      "label": "Textual"
     }
    ],
    "label": "Summary",
    "entity": "statements",
    "max": 100,
    "min": 1,
    "field": {
     "name": "statements",
     "type": "group",
     "label": "Set of statements",
     "importance": "high",
     "isSubContent": true,
     "fields": [
      {
       "name": "summary",
       "type": "list",
       "label": "List of statements for the summary - the first statement is correct.",
       "entity": "statement",
       "importance": "medium",
       "min": 2,
       "field": {
        "name": "text",
        "type": "text",
        "label": "Statement",
        "importance": "medium",
        "widget": "html",
        "enterMode": "p",
        "tags": []
       }
      },
      {
       "name": "tip",
       "type": "group",
       "label": "Tip",
       "importance": "low",
       "optional": true,
       "fields": [
        {
         "name": "tip",
         "label": "Tip text",
         "importance": "low",
         "type": "text",
         "widget": "html",
         "tags": [
          "p",
          "br",
          "strong",
          "em",
          "code"
         ],
         "optional": true
        }
       ]
      }
     ]
    }
   },
   {
    "name": "overallFeedback",
    "type": "group",
    "label": "Overall Feedback",
    "importance": "low",
    "expanded": true,
    "fields": [
     {
      "name": "overallFeedback",
      "type": "list",
      "widgets": [
       {
        "name": "RangeList",
        "label": "Default"
       }
      ],
      "importance": "high",
      "label": "Define custom feedback for any score range",
      "description": "Click the \"Add range\" button to add as many ranges as you need. Example: 0-20% Bad score, 21-91% Average Score, 91-100% Great Score!",
      "entity": "range",
      "min": 1,
      "defaultNum": 1,
      "optional": true,
      "field": {
       "name": "overallFeedback",
       "type": "group",
       "importance": "low",
       "fields": [
        {
         "name": "from",
         "type": "number",
         "label": "Score Range",
         "min": 0,
         "max": 100,
         "default": 0,
         "unit": "%"
        },
        {
         "name": "to",
         "type": "number",
         "min": 0,
         "max": 100,
         "default": 100,
         "unit": "%"
        },
        {
         "name": "feedback",
         "type": "text",
         "label": "Feedback for defined score range",
         "importance": "low",
         "placeholder": "Fill in the feedback",
         "optional": true
        }
       ]
      }
     }
    ]
   },
   {
    "name": "solvedLabel",
    "type": "text",
    "label": "Text displayed before number of statements solved in the summary task.",
    "importance": "low",
    "default": "Progress:",
    "description": "Will be displayed above the statements. Example: 'Progress: 2/5'",
    "common": true
   },
   {
    "name": "scoreLabel",
    "type": "text",
    "label": "Text displayed before number of wrong statements selected in the summary task.",
    "importance": "low",
    "default": "Wrong answers:",
    "description": "Will be displayed above the statements. Example: 'Wrong answers: 4'",
    "common": true
   },
   {
    "name": "resultLabel",
    "type": "text",
    "label": "Summary feedback header",
    "importance": "low",
    "default": "Your result",
    "description": "Will be displayed above the summary feedback.",
    "common": true
   },
   {
    "name": "labelCorrect",
    "type": "text",
    "label": "Readspeaker text for correct answer",
    "importance": "low",
    "default": "Correct.",
    "common": true
   },
   {
    "name": "labelIncorrect",
    "type": "text",
    "label": "Readspeaker text for announcing incorrect answer",
    "importance": "low",
    "default": "Incorrect! Please try again.",
    "common": true
   },
   {
    "name": "alternativeIncorrectLabel",
    "type": "text",
    "label": "Readspeaker label for incorrect answer",
    "importance": "low",
    "default": "Incorrect",
    "common": true
   },
   {
    "name": "labelCorrectAnswers",
    "type": "text",
    "label": "Label list of correct answers",
    "importance": "low",
    "default": "Correct answers.",
    "common": true
   },
   {
    "name": "tipButtonLabel",
    "type": "text",
    "label": "Label for the show tip button",
    "importance": "low",
    "default": "Show tip",
    "common": true
   },
   {
    "name": "scoreBarLabel",
    "type": "text",
    "label": "Textual representation of the score bar for those using a readspeaker",
    "description": ":num and :total are special keywords which are programmatically updated",
    "default": "You got :num out of :total points",
    "importance": "low",
    "common": true
   },
   {
    "name": "progressText",
    "type": "text",
    "label": "Text used for readspeakers to communicate progress",
    "description": ":num and :total are special keywords which are programmatically updated",
    "default": "Progress :num of :total",
    "importance": "low",
    "common": true
   }
  ],
  "deps": [
   "FontAwesome 4.5 preloaded",
   "H5P.JoubelUI 1.3 preloaded",
   "H5P.Question 1.5 preloaded"
  ]
 },
 "H5P.MarkTheWords": {
  "version": "1.11",
  "semantics": [
   {
    "name": "media",
    "type": "group",
    "label": "Media",
    "importance": "medium",
    "fields": [
     {
      "name": "type",
      "type": "library",
      "label": "Type",
      "importance": "medium",
      "options": [
       "H5P.Image 1.1",
       "H5P.Video 1.6",
       "H5P.Audio 1.5"
      ],
      "optional": true,
      "description": "Optional media to display above the question."
     },
     {
      "name": "disableImageZooming",
      "type": "boolean",
      "label": "Disable image zooming",
      "importance": "low",
      "default": false,
      "optional": true,
      "widget": "showWhen",
      "showWhen": {
       "rules": [
        {
         "field": "type",
         "equals": "H5P.Image 1.1"
        }
       ]
      }
     }
    ]
   },
   {
    "label": "Task description",
    "importance": "high",
    "name": "taskDescription",
    "type": "text",
    "widget": "html",
    "description": "Describe how the user should solve the task.",
    "placeholder": "Click on all the verbs in the text that follows.",
    "enterMode": "p",
    "tags": [
     "strong",
     "em",
     "u",
     "a",
     "ul",
     "ol",
     "h2",
     "h3",
     "hr",
     "pre",
     "code"
    ]
   },
   {
    "label": "Textfield",
    "importance": "high",
    "name": "textField",
    "type": "text",
    "widget": "html",
    "tags": [
     "p",
     "br",
     "strong",
     "em",
     "code"
    ],
    "placeholder": "This is an answer: *answer*.",
    "description": "",
    "important": {
     "description": "<ul><li>Correct words are marked with asterisks (*) before and after the word.</li><li>Asterisks can be added within marked words by adding another asterisk, *correctword*** =&gt; correctword*.</li><li>Only words may be marked as correct. Not phrases.</li></ul>",
     "example": "The correct words are marked like this: *correctword*, an asterisk is written like this: *correctword***."
    }
   },
   {
    "name": "overallFeedback",
    "type": "group",
    "label": "Overall Feedback",
    "importance": "low",
    "expanded": true,
    "fields": [
     {
      "name": "overallFeedback",
      "type": "list",
      "widgets": [
       {
        "name": "RangeList",
        "label": "Default"
       }
      ],
      "importance": "high",
      "label": "Define custom feedback for any score range",
      "description": "Click the \"Add range\" button to add as many ranges as you need. Example: 0-20% Bad score, 21-91% Average Score, 91-100% Great Score!",
      "entity": "range",
      "min": 1,
      "defaultNum": 1,
      "optional": true,
      "field": {
       "name": "overallFeedback",
       "type": "group",
       "importance": "low",
       "fields": [
        {
         "name": "from",
         "type": "number",
         "label": "Score Range",
         "min": 0,
         "max": 100,
         "default": 0,
         "unit": "%"
        },
        {
         "name": "to",
         "type": "number",
         "min": 0,
         "max": 100,
         "default": 100,
         "unit": "%"
        },
        {
         "name": "feedback",
         "type": "text",
         "label": "Feedback for defined score range",
         "importance": "low",
         "placeholder": "Fill in the feedback",
         "optional": true
        }
       ]
      }
     }
    ]
   },
   {
    "label": "Text for \"Check\" button",
    "importance": "low",
    "name": "checkAnswerButton",
    "type": "text",
    "default": "Check",
    "common": true
   },
   {
    "label": "Text for \"Submit\" button",
    "importance": "low",
    "name": "submitAnswerButton",
    "type": "text",
    "default": "Submit",
    "common": true
   },
   {
    "label": "Text for \"Retry\" button",
    "importance": "low",
    "name": "tryAgainButton",
    "type": "text",
    "default": "Retry",
    "common": true
   },
   {
    "label": "Text for \"Show solution\" button",
    "importance": "low",
    "name": "showSolutionButton",
    "type": "text",
    "default": "Show solution",
    "common": true
   },
   {
    "name": "behaviour",
    "importance": "low",
    "type": "group",
    "label": "Behavioural settings.",
    "description": "These options will let you control how the task behaves.",
    "optional": true,
    "fields": [
     {
      "name": "enableRetry",
      "type": "boolean",
      "label": "Enable \"Retry\"",
      "importance": "low",
      "default": true
     },
     {
      "name": "enableSolutionsButton",
      "type": "boolean",
      "label": "Enable \"Show solution\" button",
      "importance": "low",
      "default": true
     },
     {
      "name": "enableCheckButton",
      "type": "boolean",
      "label": "Enable \"Check\" button",
      "widget": "none",
      "importance": "low",
      "default": true,
      "optional": true
     },
     {
      "name": "showScorePoints",
      "type": "boolean",
      "label": "Show score points",
      "description": "Show points earned for each answer.",
      "importance": "low",
      "default": true
     }
    ]
   },
   {
    "label": "Correct answer text",
    "importance": "low",
    "name": "correctAnswer",
    "type": "text",
    "default": "Correct!",
    "description": "Text used to indicate that an answer is correct",
    "common": true
   },
   {
    "label": "Incorrect answer text",
    "importance": "low",
    "name": "incorrectAnswer",
    "type": "text",
    "default": "Incorrect!",
    "description": "Text used to indicate that an answer is incorrect",
    "common": true
   },
   {
    "label": "Missed answer text",
    "importance": "low",
    "name": "missedAnswer",
    "type": "text",
    "default": "Answer not found!",
    "description": "Text used to indicate that an answer is missing",
    "common": true
   },
   {
    "label": "Description for Display Solution",
    "importance": "low",
    "name": "displaySolutionDescription",
    "type": "text",
    "default": "Task is updated to contain the solution.",
    "description": "This text tells the user that the tasks has been updated with the solution.",
    "common": true
   },
   {
    "name": "scoreBarLabel",
    "type": "text",
    "label": "Textual representation of the score bar for those using a readspeaker",
    "default": "You got :num out of :total points",
    "importance": "low",
    "common": true
   },
   {
    "name": "a11yFullTextLabel",
    "type": "text",
    "label": "Label for the full readable text for assistive technologies",
    "default": "Full readable text",
    "importance": "low",
    "common": true
   },
   {
    "name": "a11yClickableTextLabel",
    "type": "text",
    "label": "Label for the text where words can be marked for assistive technologies",
    "default": "Full text where words can be marked",
    "importance": "low",
    "common": true
   },
   {
    "name": "a11ySolutionModeHeader",
    "type": "text",
    "label": "Solution mode header for assistive technologies",
    "default": "Solution mode",
    "importance": "low",
    "common": true
   },
   {
    "name": "a11yCheckingHeader",
    "type": "text",
    "label": "Checking mode header for assistive technologies",
    "default": "Checking mode",
    "importance": "low",
    "common": true
   },
   {
    "name": "a11yCheck",
    "type": "text",
    "label": "Assistive technology description for \"Check\" button",
    "default": "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
    "importance": "low",
    "common": true
   },
   {
    "name": "a11yShowSolution",
    "type": "text",
    "label": "Assistive technology description for \"Show Solution\" button",
    "default": "Show the solution. The task will be marked with its correct solution.",
    "importance": "low",
    "common": true
   },
   {
    "name": "a11yRetry",
    "type": "text",
    "label": "Assistive technology description for \"Retry\" button",
    "default": "Retry the task. Reset all responses and start the task over again.",
    "importance": "low",
    "common": true
   }
  ],
  "deps": [
   "FontAwesome 4.5 preloaded",
   "H5P.JoubelUI 1.3 preloaded",
   "H5P.Question 1.5 preloaded"
  ]
 },
 "H5P.SingleChoiceSet": {
  "version": "1.11",
  "semantics": [
   {
    "name": "choices",
    "type": "list",
    "label": "List of questions",
    "importance": "high",
    "entity": "question",
    "min": 1,
    "defaultNum": 2,
    "widgets": [
     {
      "name": "ListEditor",
      "label": "Default"
     },
     {
      "name": "SingleChoiceSetTextualEditor",
      "label": "Textual"
     }
    ],
    "field": {
     "name": "choice",
     "type": "group",
     "isSubContent": true,
     "label": "Question & alternatives",
     "importance": "high",
     "fields": [
      {
       "name": "question",
       "type": "text",
       "widget": "html",
       "tags": [
        "p",
        "br",
        "strong",
        "em",
        "code"
       ],
       "label": "Question",
       "importance": "high"
      },
      {
       "name": "answers",
       "type": "list",
       "label": "Alternatives - first alternative is the correct one.",
       "importance": "medium",
       "entity": "answer",
       "min": 2,
       "max": 4,
       "defaultNum": 2,
       "field": {
        "name": "answer",
        "type": "text",
        "widget": "html",
        "tags": [
         "p",
         "br",
         "strong",
         "em",
         "code"
        ],
        "label": "Alternative",
        "importance": "medium"
       }
      }
     ]
    }
   },
   {
    "name": "overallFeedback",
    "type": "group",
    "label": "Overall Feedback",
    "importance": "low",
    "expanded": true,
    "fields": [
     {
      "name": "overallFeedback",
      "type": "list",
      "widgets": [
       {
        "name": "RangeList",
        "label": "Default"
       }
      ],
      "importance": "high",
      "label": "Define custom feedback for any score range",
      "description": "Click the \"Add range\" button to add as many ranges as you need. Example: 0-20% Bad score, 21-91% Average Score, 91-100% Great Score!",
      "entity": "range",
      "min": 1,
      "defaultNum": 1,
      "optional": true,
      "field": {
       "name": "overallFeedback",
       "type": "group",
       "importance": "low",
       "fields": [
        {
         "name": "from",
         "type": "number",
         "label": "Score Range",
         "min": 0,
         "max": 100,
         "default": 0,
         "unit": "%"
        },
        {
         "name": "to",
         "type": "number",
         "min": 0,
         "max": 100,
         "default": 100,
         "unit": "%"
        },
        {
         "name": "feedback",
         "type": "text",
         "label": "Feedback for defined score range",
         "importance": "low",
         "placeholder": "Fill in the feedback",
         "optional": true
        }
       ]
      }
     }
    ]
   },
   {
    "name": "behaviour",
    "type": "group",
    "label": "Behavioural settings",
    "importance": "low",
    "fields": [
     {
      "name": "autoContinue",
      "type": "boolean",
      "label": "Auto continue",
      "description": "Automatically go to next question when alternative is selected. This needs to be turned off to make the content fully accessible when using a screen reader.",
      "default": true
     },
     {
      "name": "timeoutCorrect",
      "type": "number",
      "label": "Timeout on correct answers",
      "importance": "low",
      "description": "Value in milliseconds",
      "default": 2000,
      "widget": "showWhen",
      "showWhen": {
       "rules": [
        {
         "field": "autoContinue",
         "equals": true
        }
       ]
      }
     },
     {
      "name": "timeoutWrong",
      "type": "number",
      "label": "Timeout on wrong answers",
      "importance": "low",
      "description": "Value in milliseconds",
      "default": 3000,
      "widget": "showWhen",
      "showWhen": {
       "rules": [
        {
         "field": "autoContinue",
         "equals": true
        }
       ]
      }
     },
     {
      "name": "soundEffectsEnabled",
      "type": "boolean",
      "label": "Enable sound effects",
      "importance": "low",
      "default": true
     },
     {
      "name": "enableRetry",
      "type": "boolean",
      "label": "Enable retry button",
      "importance": "low",
      "default": true
     },
     {
      "name": "enableSolutionsButton",
      "type": "boolean",
      "label": "Enable show solution button",
      "importance": "low",
      "default": true
     },
     {
      "name": "passPercentage",
      "type": "number",
      "label": "Pass percentage",
      "description": "Percentage of Total score required for passing the quiz.",
      "min": 0,
      "max": 100,
      "step": 1,
      "default": 100
     }
    ]
   },
   {
    "name": "l10n",
    "type": "group",
    "label": "Localize single choice set",
    "importance": "low",
    "common": true,
    "fields": [
     {
      "name": "nextButtonLabel",
      "type": "text",
      "label": "Label for the \"Next\" button",
      "importance": "low",
      "default": "Next question"
     },
     {
      "name": "showSolutionButtonLabel",
      "type": "text",
      "label": "Label for the \"Show solution\" button",
      "importance": "low",
      "default": "Show solution"
     },
     {
      "name": "retryButtonLabel",
      "type": "text",
      "label": "Label for the \"Retry\" button",
      "importance": "low",
      "default": "Retry"
     },
     {
      "name": "solutionViewTitle",
      "type": "text",
      "label": "Title for the show solution view",
      "importance": "low",
      "default": "Solution list"
     },
     {
      "name": "correctText",
      "type": "text",
      "label": "Readspeaker text for correct answer",
      "importance": "low",
      "default": "Correct!"
     },
     {
      "name": "incorrectText",
      "type": "text",
      "label": "Readspeaker text for incorrect answer",
      "importance": "low",
      "default": "Incorrect!"
     },
     {
      "name": "shouldSelect",
      "type": "text",
      "label": "Option should have been selected",
      "importance": "low",
      "default": "Should have been selected"
     },
     {
      "name": "shouldNotSelect",
      "type": "text",
      "label": "Option should not have been selected",
      "importance": "low",
      "default": "Should not have been selected"
     },
     {
      "name": "muteButtonLabel",
      "type": "text",
      "label": "Label for the \"mute\" button, to disable feedback sound",
      "importance": "low",
      "default": "Mute feedback sound"
     },
     {
      "name": "closeButtonLabel",
      "type": "text",
      "label": "Label for the \"Close\" button",
      "importance": "low",
      "default": "Close"
     },
     {
      "name": "slideOfTotal",
      "type": "text",
      "label": "Slide number text",
      "importance": "low",
      "description": "Announces current slide and total number of slides, variables are :num and :total",
      "default": "Slide :num of :total"
     },
     {
      "name": "scoreBarLabel",
      "type": "text",
      "label": "Textual representation of the score bar for those using a readspeaker",
      "default": "You got :num out of :total points",
      "importance": "low"
     },
     {
      "name": "solutionListQuestionNumber",
      "type": "text",
      "label": "Label for the question number in the solution list",
      "importance": "low",
      "description": "Announces current question index in solution list, variables are :num",
      "default": "Question :num"
     },
     {
      "name": "a11yShowSolution",
      "type": "text",
      "label": "Assistive technology description for \"Show Solution\" button",
      "default": "Show the solution. The task will be marked with its correct solution.",
      "importance": "low"
     },
     {
      "name": "a11yRetry",
      "type": "text",
      "label": "Assistive technology description for \"Retry\" button",
      "default": "Retry the task. Reset all responses and start the task over again.",
      "importance": "low"
     }
    ]
   }
  ],
  "deps": [
   "FontAwesome 4.5 preloaded",
   "H5P.JoubelUI 1.3 preloaded",
   "H5P.Transition 1.0 preloaded",
   "H5P.Question 1.5 preloaded"
  ]
 },
 "H5P.Crossword": {
  "version": "0.5",
  "semantics": [
   {
    "name": "taskDescription",
    "label": "Task description",
    "type": "text",
    "widget": "html",
    "importance": "high",
    "description": "Describe your task here.",
    "enterMode": "div",
    "tags": [
     "strong",
     "em",
     "u",
     "a",
     "ul",
     "ol",
     "h2",
     "h3",
     "hr",
     "pre",
     "code"
    ],
    "optional": true
   },
   {
    "name": "words",
    "label": "words",
    "importance": "high",
    "type": "list",
    "widgets": [
     {
      "name": "VerticalTabs",
      "label": "Default"
     }
    ],
    "min": 2,
    "entity": "Word",
    "field": {
     "name": "word",
     "type": "group",
     "label": "Word",
     "fields": [
      {
       "name": "clue",
       "type": "text",
       "label": "Clue",
       "description": "Clue that should point to the answer.",
       "importance": "medium"
      },
      {
       "name": "answer",
       "type": "text",
       "label": "Answer",
       "description": "Answer to the clue.",
       "importance": "medium"
      },
      {
       "name": "extraClue",
       "type": "library",
       "label": "Extra clue",
       "optional": true,
       "options": [
        "H5P.AdvancedText 1.1",
        "H5P.Image 1.1",
        "H5P.Audio 1.5",
        "H5P.Video 1.6"
       ]
      },
      {
       "name": "fixWord",
       "type": "boolean",
       "label": "Fix word on grid",
       "description": "Check if you want to fix the word to a particular position on the grid. Words with the same alignment may not be placed touching each other.",
       "importance": "low",
       "default": false,
       "optional": true
      },
      {
       "name": "row",
       "type": "number",
       "label": "Row",
       "description": "Row index where the answer should start.",
       "min": 1,
       "max": 100,
       "importance": "low",
       "widget": "showWhen",
       "showWhen": {
        "rules": [
         {
          "field": "fixWord",
          "equals": true
         }
        ]
       }
      },
      {
       "name": "column",
       "type": "number",
       "label": "Column",
       "description": "Column index where the answer should start.",
       "min": 1,
       "max": 100,
       "importance": "low",
       "widget": "showWhen",
       "showWhen": {
        "rules": [
         {
          "field": "fixWord",
          "equals": true
         }
        ]
       }
      },
      {
       "name": "orientation",
       "type": "select",
       "label": "Orientation",
       "description": "Orientation for the answer.",
       "options": [
        {
         "value": "across",
         "label": "Across"
        },
        {
         "value": "down",
         "label": "Down"
        }
       ],
       "default": "across",
       "widget": "showWhen",
       "showWhen": {
        "rules": [
         {
          "field": "fixWord",
          "equals": true
         }
        ]
       }
      }
     ]
    }
   },
   {
    "name": "solutionWord",
    "type": "text",
    "label": "Overall solution word",
    "description": "Optionally add a solution word that can be derived from particular characters on the grid. It will only be visible if all its characters can be found in the crossword. Please note: There's no accessibility support for this feature yet.",
    "importance": "low",
    "optional": "true"
   },
   {
    "name": "overallFeedback",
    "type": "group",
    "label": "Overall Feedback",
    "importance": "low",
    "expanded": true,
    "fields": [
     {
      "name": "overallFeedback",
      "type": "list",
      "widgets": [
       {
        "name": "RangeList",
        "label": "Default"
       }
      ],
      "importance": "high",
      "label": "Define custom feedback for any score range",
      "description": "Click the \"Add range\" button to add as many ranges as you need. Example: 0-20% Bad score, 21-91% Average Score, 91-100% Great Score!",
      "entity": "range",
      "min": 1,
      "defaultNum": 1,
      "optional": true,
      "field": {
       "name": "overallFeedback",
       "type": "group",
       "importance": "low",
       "fields": [
        {
         "name": "from",
         "type": "number",
         "label": "Score Range",
         "min": 0,
         "max": 100,
         "default": 0,
         "unit": "%"
        },
        {
         "name": "to",
         "type": "number",
         "min": 0,
         "max": 100,
         "default": 100,
         "unit": "%"
        },
        {
         "name": "feedback",
         "type": "text",
         "label": "Feedback for defined score range",
         "importance": "low",
         "placeholder": "Fill in the feedback",
         "optional": true
        }
       ]
      }
     }
    ]
   },
   {
    "name": "theme",
    "type": "group",
    "label": "Theme",
    "importance": "low",
    "fields": [
     {
      "name": "backgroundImage",
      "label": "Background image",
      "type": "image",
      "description": "Select an optional background image. It will be scaled to fit the background without stretching it.",
      "importance": "low",
      "optional": true
     },
     {
      "name": "backgroundColor",
      "type": "text",
      "label": "Background color",
      "description": "Choose a background color. It will either be used instead of a background image or as background for transparent areas.",
      "importance": "low",
      "optional": true,
      "default": "#173354",
      "widget": "colorSelector",
      "spectrum": {
       "showInput": true,
       "showInitial": true
      }
     },
     {
      "name": "gridColor",
      "type": "text",
      "label": "Grid color",
      "description": "Choose a color for the grid.",
      "importance": "low",
      "optional": true,
      "default": "#000000",
      "widget": "colorSelector",
      "spectrum": {
       "showInput": true,
       "showInitial": true
      }
     },
     {
      "name": "cellBackgroundColor",
      "type": "text",
      "label": "Cell background color",
      "description": "Choose the background color for a table cell.",
      "importance": "low",
      "optional": true,
      "default": "#ffffff",
      "widget": "colorSelector",
      "spectrum": {
       "showInput": true,
       "showInitial": true
      }
     },
     {
      "name": "cellColor",
      "type": "text",
      "label": "Cell text color",
      "description": "Choose the text color for a table cell.",
      "importance": "low",
      "optional": true,
      "default": "#000000",
      "widget": "colorSelector",
      "spectrum": {
       "showInput": true,
       "showInitial": true
      }
     },
     {
      "name": "clueIdColor",
      "type": "text",
      "label": "Clue id color",
      "description": "Choose the color of the clue id inside a table cell.",
      "importance": "low",
      "optional": true,
      "default": "#606060",
      "widget": "colorSelector",
      "spectrum": {
       "showInput": true,
       "showInitial": true
      }
     },
     {
      "name": "cellBackgroundColorHighlight",
      "type": "text",
      "label": "Cell background color (highlighted)",
      "description": "Choose the background color for a table cell that is highlighted.",
      "importance": "low",
      "optional": true,
      "default": "#3e8de8",
      "widget": "colorSelector",
      "spectrum": {
       "showInput": true,
       "showInitial": true
      }
     },
     {
      "name": "cellColorHighlight",
      "type": "text",
      "label": "Cell text color (highlighted)",
      "description": "Choose the text color for a table cell that is highlighted.",
      "importance": "low",
      "optional": true,
      "default": "#ffffff",
      "widget": "colorSelector",
      "spectrum": {
       "showInput": true,
       "showInitial": true
      }
     },
     {
      "name": "clueIdColorHighlight",
      "type": "text",
      "label": "Cell id color (highlighted)",
      "description": "Choose the color of the clue id inside a table cell that is highlighted.",
      "importance": "low",
      "optional": true,
      "default": "#e0e0e0",
      "widget": "colorSelector",
      "spectrum": {
       "showInput": true,
       "showInitial": true
      }
     }
    ]
   },
   {
    "name": "behaviour",
    "type": "group",
    "label": "Behavioural settings",
    "importance": "low",
    "description": "These options will let you control how the task behaves.",
    "fields": [
     {
      "name": "poolSize",
      "type": "number",
      "min": 2,
      "label": "Number of words to be shown",
      "importance": "low",
      "description": "Create a randomized batch of words from the pool. The batch will always contain at least all the words that were fixed on the grid regardless of this setting. An empty value or 0 means to use all words.",
      "optional": true
     },
     {
      "name": "enableInstantFeedback",
      "label": "Enable instant feedback",
      "type": "boolean",
      "importance": "low",
      "default": false
     },
     {
      "name": "scoreWords",
      "label": "Score words",
      "description": "If this option is enabled, words will be counted in order to determine the score. Otherwise, correct characters will be counted.",
      "type": "boolean",
      "importance": "low",
      "default": true
     },
     {
      "name": "applyPenalties",
      "label": "Apply penalties",
      "description": "If this option is enabled, each wrong answer will be given a penalty score of -1.",
      "type": "boolean",
      "importance": "low",
      "default": false,
      "optional": true
     },
     {
      "name": "enableRetry",
      "label": "Enable \"Retry\"",
      "type": "boolean",
      "importance": "low",
      "default": true,
      "optional": true
     },
     {
      "name": "enableSolutionsButton",
      "label": "Enable \"Solution\"",
      "type": "boolean",
      "importance": "low",
      "default": true,
      "optional": true
     },
     {
      "name": "keepCorrectAnswers",
      "type": "boolean",
      "label": "Keep correct answers on retry",
      "description": "If this option is enabled, correct answers will be kept when the user retries the task unless full score was achieved.",
      "importance": "low",
      "default": false,
      "optional": true,
      "widget": "showWhen",
      "showWhen": {
       "rules": [
        {
         "field": "enableRetry",
         "equals": true
        }
       ],
       "nullWhenHidden": true
      }
     }
    ]
   },
   {
    "name": "l10n",
    "type": "group",
    "common": true,
    "label": "User interface",
    "importance": "low",
    "fields": [
     {
      "name": "across",
      "type": "text",
      "label": "Label for across",
      "importance": "low",
      "default": "Across"
     },
     {
      "name": "down",
      "type": "text",
      "label": "Label for down",
      "importance": "low",
      "default": "Down"
     },
     {
      "name": "checkAnswer",
      "type": "text",
      "label": "Text for \"Check\" button",
      "importance": "low",
      "default": "Check"
     },
     {
      "name": "submitAnswer",
      "type": "text",
      "label": "Text for \"Submit\" button",
      "importance": "low",
      "default": "Submit"
     },
     {
      "name": "tryAgain",
      "label": "Text for \"Retry\" button",
      "type": "text",
      "importance": "low",
      "default": "Retry"
     },
     {
      "name": "showSolution",
      "type": "text",
      "label": "Text for \"Show solution\" button",
      "importance": "low",
      "default": "Show solution"
     },
     {
      "name": "couldNotGenerateCrossword",
      "type": "text",
      "label": "Cannot create crossword",
      "importance": "low",
      "default": "Could not generate a crossword with the given words. Please try again with fewer words or words that have more characters in common."
     },
     {
      "name": "couldNotGenerateCrosswordTooFewWords",
      "type": "text",
      "label": "Cannot create crossword (too few words)",
      "importance": "low",
      "default": "Could not generate a crossword. You need at least two words."
     },
     {
      "name": "probematicWords",
      "type": "text",
      "label": "Probematic words",
      "description": "List words that caused trouble while generating the crossword. @words is a placeholder that will be replaced by the actual problematic words.",
      "importance": "low",
      "default": "Some words could not be placed. If you are using fixed words, please make sure that their position doesn't prevent other words from being placed. Words with the same alignment may not be placed touching each other. Problematic word(s): @words"
     },
     {
      "name": "extraClue",
      "type": "text",
      "label": "Extra clue",
      "importance": "low",
      "default": "Extra clue"
     },
     {
      "name": "closeWindow",
      "type": "text",
      "label": "Close window",
      "importance": "low",
      "default": "Close window"
     }
    ]
   },
   {
    "name": "a11y",
    "type": "group",
    "common": true,
    "label": "Readspeaker",
    "importance": "low",
    "fields": [
     {
      "name": "crosswordGrid",
      "type": "text",
      "label": "Crossword grid description",
      "importance": "low",
      "default": "Crossword grid. Use arrow keys to navigate and the keyboard to enter characters. Alternatively, use Tab to navigate to type the answers in Fill in the Blanks style fields instead of the grid."
     },
     {
      "name": "column",
      "type": "text",
      "label": "Column",
      "importance": "low",
      "default": "Column"
     },
     {
      "name": "row",
      "type": "text",
      "label": "Row",
      "importance": "low",
      "default": "Row"
     },
     {
      "name": "across",
      "type": "text",
      "label": "Across",
      "importance": "low",
      "default": "Across"
     },
     {
      "name": "down",
      "type": "text",
      "label": "Down",
      "importance": "low",
      "default": "Down"
     },
     {
      "name": "empty",
      "type": "text",
      "label": "Empty",
      "importance": "low",
      "default": "Empty"
     },
     {
      "name": "resultFor",
      "description": "Result announcer. @clue is a variable and will be replaced by the respective clue.",
      "type": "text",
      "label": "Result for",
      "importance": "low",
      "default": "Result for: @clue"
     },
     {
      "name": "correct",
      "type": "text",
      "label": "Correct",
      "importance": "low",
      "default": "Correct"
     },
     {
      "name": "wrong",
      "type": "text",
      "label": "Wrong",
      "importance": "low",
      "default": "Wrong"
     },
     {
      "name": "point",
      "type": "text",
      "label": "Point",
      "importance": "low",
      "default": "point"
     },
     {
      "name": "solutionFor",
      "description": "Solution announcer. @clue and @solution are variables and will be replaced by the respective values.",
      "type": "text",
      "label": "Solution for",
      "importance": "low",
      "default": "For @clue the solution is: @solution"
     },
     {
      "name": "extraClueFor",
      "description": "Extra clue announcer. @clue is a variable and will be replaced by the respective value.",
      "type": "text",
      "label": "Extra clue for",
      "importance": "low",
      "default": "Open extra clue for @clue"
     },
     {
      "name": "letterSevenOfNine",
      "description": "Announcing the current position. @position and @length are variables and will be replaced by their respective values.",
      "type": "text",
      "label": "Letter",
      "importance": "low",
      "default": "Letter @position of @length"
     },
     {
      "name": "lettersWord",
      "description": "Announcing the word length. @length is a variable and will be replaced by the respective value.",
      "type": "text",
      "label": "Length of word",
      "importance": "low",
      "default": "@length letter word"
     },
     {
      "name": "check",
      "type": "text",
      "label": "Assistive technology description for \"Check\" button",
      "importance": "low",
      "default": "Check the characters. The responses will be marked as correct, incorrect, or unanswered."
     },
     {
      "name": "showSolution",
      "type": "text",
      "label": "Assistive technology description for \"Show Solution\" button",
      "importance": "low",
      "default": "Show the solution. The crossword will be filled with its correct solution."
     },
     {
      "name": "retry",
      "type": "text",
      "label": "Assistive technology description for \"Retry\" button",
      "importance": "low",
      "default": "Retry the task. Reset all responses and start the task over again."
     },
     {
      "name": "yourResult",
      "type": "text",
      "label": "Your result",
      "description": "@score and @total are variables and will be replaced by their respective values.",
      "importance": "low",
      "default": "You got @score out of @total points"
     }
    ]
   }
  ],
  "deps": [
   "H5P.Question 1.5 preloaded",
   "H5P.JoubelUI 1.3 preloaded",
   "H5P.Image 1.1 preloaded",
   "H5P.MaterialDesignIcons 1.0 preloaded"
  ]
 },
 "H5P.Timeline": {
  "version": "1.1",
  "semantics": [
   {
    "name": "timeline",
    "label": "Timeline",
    "importance": "high",
    "type": "group",
    "expanded": true,
    "fields": [
     {
      "name": "headline",
      "type": "text",
      "label": "Headline",
      "importance": "high",
      "description": "Main timeline heading goes here (first page)"
     },
     {
      "name": "text",
      "type": "text",
      "label": "Body Text",
      "importance": "medium",
      "widget": "html",
      "description": "The main timeline body goes here (first page).",
      "optional": true,
      "tags": [
       "strong",
       "em",
       "del",
       "a",
       "ul",
       "ol",
       "hr",
       "code"
      ]
     },
     {
      "name": "defaultZoomLevel",
      "type": "text",
      "label": "Default zoom level",
      "importance": "low",
      "default": "0",
      "optional": true,
      "description": "This will tweak the default zoom level. Equivilent to pressing the zoom in or zoom out button the specified number of times. Negative numbers zoom out. default is 0"
     },
     {
      "name": "backgroundImage",
      "type": "image",
      "label": "Background image",
      "importance": "low",
      "optional": true,
      "description": "An image to display as background."
     },
     {
      "name": "height",
      "type": "number",
      "label": "Height",
      "importance": "low",
      "description": "The height in pixels",
      "default": 600
     },
     {
      "name": "asset",
      "type": "group",
      "label": "Asset",
      "importance": "low",
      "description": "Here you can add an asset to your timeline \"front page\"",
      "optional": true,
      "fields": [
       {
        "name": "media",
        "type": "text",
        "label": "Media",
        "importance": "low",
        "description": "Link to media URL (Twitter, YouTube, Flickr, Vimeo, Google Maps and SoundCloud are currently supported)",
        "optional": true
       },
       {
        "name": "credit",
        "type": "text",
        "label": "Credits",
        "importance": "low",
        "description": "Credits to the media",
        "optional": true
       },
       {
        "name": "caption",
        "type": "text",
        "label": "Caption",
        "importance": "low",
        "description": "Caption description goes here",
        "optional": true
       }
      ]
     },
     {
      "name": "date",
      "type": "list",
      "label": "Dates",
      "importance": "medium",
      "min": 1,
      "description": "Add some dates to your timeline!",
      "field": {
       "name": "adate",
       "type": "group",
       "label": "Date",
       "importance": "medium",
       "description": "Date",
       "fields": [
        {
         "name": "startDate",
         "type": "text",
         "label": "Start date",
         "importance": "medium",
         "description": "YYYY,MM,DD (Minimum YYYY required)",
         "regexp": {
          "pattern": "^-?\\d{1,}(,(1[012]|[0]?[1-9])(,([12][0-9]|3[01]|[0]?[1-9]))?)?$"
         }
        },
        {
         "name": "endDate",
         "type": "text",
         "label": "End date",
         "importance": "medium",
         "description": "YYYY,MM,DD (Minimum YYYY required)",
         "optional": true,
         "regexp": {
          "pattern": "^-?\\d{1,}(,(1[012]|[0]?[1-9])(,([12][0-9]|3[01]|[0]?[1-9]))?)?$"
         }
        },
        {
         "name": "headline",
         "type": "text",
         "label": "Headline",
         "importance": "medium",
         "description": "Headline for the date entry"
        },
        {
         "name": "text",
         "type": "text",
         "label": "Body text",
         "importance": "medium",
         "widget": "html",
         "optional": true,
         "description": "Body for the date entry",
         "tags": [
          "strong",
          "em",
          "del",
          "a",
          "ul",
          "ol",
          "h2",
          "h3",
          "hr",
          "pre",
          "code"
         ]
        },
        {
         "name": "tag",
         "type": "text",
         "label": "Tags",
         "importance": "medium",
         "description": "Enter Tags (categories)",
         "optional": true
        },
        {
         "name": "asset",
         "type": "group",
         "label": "Asset",
         "importance": "low",
         "description": "",
         "optional": true,
         "fields": [
          {
           "name": "media",
           "type": "text",
           "label": "Media",
           "importance": "low",
           "description": "URL to the media (Twitter, YouTube, Flickr, Vimeo, Wikipedia, Google Maps and SoundCloud are currently supported).",
           "optional": true
          },
          {
           "name": "thumbnail",
           "type": "image",
           "label": "Thumbnail",
           "importance": "low",
           "description": "Add a thumbnail if needed, 32x32",
           "optional": true
          },
          {
           "name": "credit",
           "type": "text",
           "label": "Credit",
           "importance": "low",
           "description": "Credits to the media",
           "optional": true
          },
          {
           "name": "caption",
           "type": "text",
           "label": "Caption",
           "importance": "low",
           "description": "Caption text",
           "optional": true
          }
         ]
        }
       ]
      }
     },
     {
      "name": "era",
      "type": "list",
      "label": "Eras",
      "importance": "medium",
      "description": "Add an era to your timeline",
      "min": 0,
      "optional": true,
      "field": {
       "name": "anera",
       "type": "group",
       "label": "Era",
       "importance": "medium",
       "description": "",
       "fields": [
        {
         "name": "startDate",
         "type": "text",
         "label": "Start date",
         "importance": "medium",
         "description": "YYYY,MM,DD (Minimum YYYY required)",
         "regexp": {
          "pattern": "^-?\\d{1,}(,(1[012]|[0]?[1-9])(,([12][0-9]|3[01]|[0]?[1-9]))?)?$"
         }
        },
        {
         "name": "endDate",
         "type": "text",
         "label": "End date",
         "importance": "medium",
         "description": "YYYY,MM,DD (Minimum YYYY required)",
         "optional": true,
         "regexp": {
          "pattern": "^-?\\d{1,}(,(1[012]|[0]?[1-9])(,([12][0-9]|3[01]|[0]?[1-9]))?)?$"
         }
        },
        {
         "name": "headline",
         "type": "text",
         "label": "Headline",
         "importance": "medium",
         "description": "Era headline"
        },
        {
         "name": "text",
         "type": "text",
         "label": "Text",
         "importance": "medium",
         "widget": "html",
         "optional": true,
         "description": "Era body",
         "tags": [
          "strong",
          "em",
          "del",
          "a",
          "ul",
          "ol",
          "hr",
          "code"
         ]
        },
        {
         "name": "tag",
         "type": "text",
         "label": "Tag",
         "importance": "medium",
         "description": "Era tags (categories)",
         "optional": true
        }
       ]
      }
     },
     {
      "name": "language",
      "type": "select",
      "label": "Language",
      "importance": "medium",
      "optional": true,
      "description": "The language of the user interface",
      "options": [
       {
        "value": "af",
        "label": "Afrikaans"
       },
       {
        "value": "ar",
        "label": "Arabic"
       },
       {
        "value": "hy",
        "label": "Armenian"
       },
       {
        "value": "eu",
        "label": "Basque"
       },
       {
        "value": "bg",
        "label": "Bulgarian"
       },
       {
        "value": "ca",
        "label": "Catalan"
       },
       {
        "value": "zh-cn",
        "label": "Chinese"
       },
       {
        "value": "hr",
        "label": "Croatian / Hrvatski"
       },
       {
        "value": "cz",
        "label": "Czech"
       },
       {
        "value": "da",
        "label": "Danish"
       },
       {
        "value": "nl",
        "label": "Dutch"
       },
       {
        "value": "en",
        "label": "English"
       },
       {
        "value": "en-24hr",
        "label": "English (24-hour time)"
       },
       {
        "value": "eo",
        "label": "Esperanto"
       },
       {
        "value": "et",
        "label": "Estonian"
       },
       {
        "value": "fo",
        "label": "Faroese"
       },
       {
        "value": "fa",
        "label": "Farsi"
       },
       {
        "value": "fi",
        "label": "Finnish"
       },
       {
        "value": "fr",
        "label": "French"
       },
       {
        "value": "gl",
        "label": "Galician"
       },
       {
        "value": "ka",
        "label": "Georgian"
       },
       {
        "value": "de",
        "label": "German / Deutsch"
       },
       {
        "value": "el",
        "label": "Greek"
       },
       {
        "value": "he",
        "label": "Hebrew"
       },
       {
        "value": "hu",
        "label": "Hungarian"
       },
       {
        "value": "is",
        "label": "Icelandic"
       },
       {
        "value": "id",
        "label": "Indonesian"
       },
       {
        "value": "it",
        "label": "Italian"
       },
       {
        "value": "ja",
        "label": "Japanese"
       },
       {
        "value": "ko",
        "label": "Korean"
       },
       {
        "value": "lv",
        "label": "Latvian"
       },
       {
        "value": "lt",
        "label": "Lithuanian"
       },
       {
        "value": "lb",
        "label": "Luxembourgish"
       },
       {
        "value": "ms",
        "label": "Malay"
       },
       {
        "value": "ne",
        "label": "Nepali"
       },
       {
        "value": "no",
        "label": "Norwegian"
       },
       {
        "value": "pl",
        "label": "Polish"
       },
       {
        "value": "pt",
        "label": "Portuguese"
       },
       {
        "value": "pt-br",
        "label": "Portuguese (Brazilian)"
       },
       {
        "value": "rm",
        "label": "Romansh"
       },
       {
        "value": "ru",
        "label": "Russian"
       },
       {
        "value": "sr-cy",
        "label": "Serbian - Cyrillic"
       },
       {
        "value": "sr",
        "label": "Serbian - Latin"
       },
       {
        "value": "si",
        "label": "Sinhalese"
       },
       {
        "value": "sk",
        "label": "Slovak"
       },
       {
        "value": "sl",
        "label": "Slovenian"
       },
       {
        "value": "es",
        "label": "Spanish"
       },
       {
        "value": "sv",
        "label": "Swedish"
       },
       {
        "value": "tl",
        "label": "Tagalog"
       },
       {
        "value": "ta",
        "label": "Tamil"
       },
       {
        "value": "zh-tw",
        "label": "Taiwanese"
       },
       {
        "value": "te",
        "label": "Telugu"
       },
       {
        "value": "tr",
        "label": "Turkish"
       },
       {
        "value": "uk",
        "label": "Ukrainian"
       }
      ],
      "default": "en"
     }
    ]
   }
  ],
  "deps": [
   "TimelineJS 1.1 preloaded"
  ]
 }
};
