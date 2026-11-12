/**
 * H5P field definitions for the content types the builder can make.
 *
 * GENERATED, do not edit by hand. Source: h5p_semantics.json of the Python
 * module builder (read from a Moodle 5.0.1 site): for each library its
 * version, its semantics (used to fill in interface wording such as button
 * labels) and its dependencies. Regenerate with a script that writes
 * JSON.stringify of that file into this constant.
 */

export interface SemField { name?: string; type?: string; default?: unknown; common?: boolean; fields?: SemField[]; [k: string]: unknown }
export interface SemLibrary { version: string; semantics: SemField[]; deps?: string[] }

export const SEMANTICS: Record<string, SemLibrary> = {
 "H5P.MultiChoice": {
  "version": "1.16",
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
    "name": "question",
    "type": "text",
    "importance": "medium",
    "widget": "html",
    "label": "Question",
    "enterMode": "p",
    "tags": [
     "strong",
     "em",
     "sub",
     "sup",
     "h2",
     "h3",
     "pre",
     "code"
    ]
   },
   {
    "name": "answers",
    "type": "list",
    "importance": "high",
    "label": "Available options",
    "entity": "option",
    "min": 1,
    "defaultNum": 2,
    "field": {
     "name": "answer",
     "type": "group",
     "label": "Option",
     "importance": "high",
     "fields": [
      {
       "name": "text",
       "type": "text",
       "importance": "medium",
       "widget": "html",
       "label": "Text",
       "tags": [
        "strong",
        "em",
        "sub",
        "sup",
        "code"
       ]
      },
      {
       "name": "correct",
       "type": "boolean",
       "label": "Correct",
       "importance": "low"
      },
      {
       "name": "tipsAndFeedback",
       "type": "group",
       "label": "Tips and feedback",
       "importance": "low",
       "optional": true,
       "fields": [
        {
         "name": "tip",
         "type": "text",
         "widget": "html",
         "label": "Tip text",
         "importance": "low",
         "description": "Hint for the user. This will appear before user checks his answer/answers.",
         "optional": true,
         "tags": [
          "p",
          "br",
          "strong",
          "em",
          "a",
          "code"
         ]
        },
        {
         "name": "chosenFeedback",
         "type": "text",
         "widget": "html",
         "label": "Message displayed if answer is selected",
         "importance": "low",
         "description": "Message will appear below the answer on \"check\" if this answer is selected.",
         "optional": true,
         "tags": [
          "strong",
          "em",
          "sub",
          "sup",
          "a",
          "code"
         ]
        },
        {
         "name": "notChosenFeedback",
         "type": "text",
         "widget": "html",
         "label": "Message displayed if answer is not selected",
         "importance": "low",
         "description": "Message will appear below the answer on \"check\" if this answer is not selected.",
         "optional": true,
         "tags": [
          "strong",
          "em",
          "sub",
          "sup",
          "a",
          "code"
         ]
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
    "name": "UI",
    "type": "group",
    "label": "User interface translations for multichoice",
    "importance": "low",
    "common": true,
    "fields": [
     {
      "name": "checkAnswerButton",
      "type": "text",
      "label": "Check answer button label",
      "importance": "low",
      "default": "Check"
     },
     {
      "name": "submitAnswerButton",
      "type": "text",
      "label": "Submit answer button label",
      "importance": "low",
      "default": "Submit"
     },
     {
      "name": "showSolutionButton",
      "type": "text",
      "label": "Show solution button label",
      "importance": "low",
      "default": "Show solution"
     },
     {
      "name": "tryAgainButton",
      "type": "text",
      "label": "Retry button label",
      "importance": "low",
      "default": "Retry",
      "optional": true
     },
     {
      "name": "tipsLabel",
      "type": "text",
      "label": "Tip label",
      "importance": "low",
      "default": "Show tip",
      "optional": true
     },
     {
      "name": "scoreBarLabel",
      "type": "text",
      "label": "Textual representation of the score bar for those using a readspeaker",
      "description": "Available variables are :num and :total",
      "importance": "low",
      "default": "You got :num out of :total points",
      "optional": true
     },
     {
      "name": "tipAvailable",
      "type": "text",
      "label": "Tip Available (not displayed)",
      "importance": "low",
      "default": "Tip available",
      "description": "Accessibility text used for readspeakers",
      "optional": true
     },
     {
      "name": "feedbackAvailable",
      "type": "text",
      "label": "Feedback Available (not displayed)",
      "importance": "low",
      "default": "Feedback available",
      "description": "Accessibility text used for readspeakers",
      "optional": true
     },
     {
      "name": "readFeedback",
      "type": "text",
      "label": "Read Feedback (not displayed)",
      "importance": "low",
      "default": "Read feedback",
      "description": "Accessibility text used for readspeakers",
      "optional": true,
      "deprecated": true
     },
     {
      "name": "wrongAnswer",
      "type": "text",
      "label": "Wrong Answer (not displayed)",
      "importance": "low",
      "default": "Wrong answer",
      "description": "Accessibility text used for readspeakers",
      "optional": true,
      "deprecated": true
     },
     {
      "name": "correctAnswer",
      "type": "text",
      "label": "Correct Answer (not displayed)",
      "importance": "low",
      "default": "Correct answer",
      "description": "Accessibility text used for readspeakers",
      "optional": true
     },
     {
      "name": "shouldCheck",
      "type": "text",
      "label": "Option should have been checked",
      "importance": "low",
      "default": "Should have been checked",
      "optional": true
     },
     {
      "name": "shouldNotCheck",
      "type": "text",
      "label": "Option should not have been checked",
      "importance": "low",
      "default": "Should not have been checked",
      "optional": true
     },
     {
      "label": "Text for \"Requires answer\" message",
      "importance": "low",
      "name": "noInput",
      "type": "text",
      "default": "Please answer before viewing the solution",
      "optional": true
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
    ]
   },
   {
    "name": "behaviour",
    "type": "group",
    "label": "Behavioural settings",
    "importance": "low",
    "description": "These options will let you control how the task behaves.",
    "optional": true,
    "fields": [
     {
      "name": "enableRetry",
      "type": "boolean",
      "label": "Enable \"Retry\" button",
      "importance": "low",
      "default": true,
      "optional": true
     },
     {
      "name": "enableSolutionsButton",
      "type": "boolean",
      "label": "Enable \"Show Solution\" button",
      "importance": "low",
      "default": true,
      "optional": true
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
      "name": "type",
      "type": "select",
      "label": "Question Type",
      "importance": "low",
      "description": "Select the look and behaviour of the question.",
      "default": "auto",
      "options": [
       {
        "value": "auto",
        "label": "Automatic"
       },
       {
        "value": "multi",
        "label": "Multiple Choice (Checkboxes)"
       },
       {
        "value": "single",
        "label": "Single Choice (Radio Buttons)"
       }
      ]
     },
     {
      "name": "singlePoint",
      "type": "boolean",
      "label": "Give one point for the whole task",
      "importance": "low",
      "description": "Enable to give a total of one point for multiple correct answers. This will not be an option in \"Single answer\" mode.",
      "default": false
     },
     {
      "name": "randomAnswers",
      "type": "boolean",
      "label": "Randomize answers",
      "importance": "low",
      "description": "Enable to randomize the order of the answers on display.",
      "default": true
     },
     {
      "label": "Require answer before the solution can be viewed",
      "importance": "low",
      "name": "showSolutionsRequiresInput",
      "type": "boolean",
      "default": true,
      "optional": true
     },
     {
      "label": "Show confirmation dialog on \"Check\"",
      "importance": "low",
      "name": "confirmCheckDialog",
      "type": "boolean",
      "default": false
     },
     {
      "label": "Show confirmation dialog on \"Retry\"",
      "importance": "low",
      "name": "confirmRetryDialog",
      "type": "boolean",
      "default": false
     },
     {
      "label": "Automatically check answers",
      "importance": "low",
      "name": "autoCheck",
      "type": "boolean",
      "default": false,
      "description": "Enabling this option will make accessibility suffer, make sure you know what you're doing."
     },
     {
      "label": "Pass percentage",
      "name": "passPercentage",
      "type": "number",
      "description": "This setting often won't have any effect. It is the percentage of the total score required for getting 1 point when one point for the entire task is enabled, and for getting result.success in xAPI statements.",
      "min": 0,
      "max": 100,
      "step": 1,
      "default": 100
     },
     {
      "name": "showScorePoints",
      "type": "boolean",
      "label": "Show score points",
      "description": "Show points earned for each answer. This will not be an option in 'Single answer' mode or if 'Give one point for the whole task' option is enabled.",
      "importance": "low",
      "default": true
     }
    ]
   },
   {
    "label": "Check confirmation dialog",
    "importance": "low",
    "name": "confirmCheck",
    "type": "group",
    "common": true,
    "fields": [
     {
      "label": "Header text",
      "importance": "low",
      "name": "header",
      "type": "text",
      "default": "Finish ?"
     },
     {
      "label": "Body text",
      "importance": "low",
      "name": "body",
      "type": "text",
      "default": "Are you sure you wish to finish ?",
      "widget": "html",
      "enterMode": "p",
      "tags": [
       "strong",
       "em",
       "del",
       "u",
       "code"
      ]
     },
     {
      "label": "Cancel button label",
      "importance": "low",
      "name": "cancelLabel",
      "type": "text",
      "default": "Cancel"
     },
     {
      "label": "Confirm button label",
      "importance": "low",
      "name": "confirmLabel",
      "type": "text",
      "default": "Finish"
     }
    ]
   },
   {
    "label": "Retry confirmation dialog",
    "importance": "low",
    "name": "confirmRetry",
    "type": "group",
    "common": true,
    "fields": [
     {
      "label": "Header text",
      "importance": "low",
      "name": "header",
      "type": "text",
      "default": "Retry ?"
     },
     {
      "label": "Body text",
      "importance": "low",
      "name": "body",
      "type": "text",
      "default": "Are you sure you wish to retry ?",
      "widget": "html",
      "enterMode": "p",
      "tags": [
       "strong",
       "em",
       "del",
       "u",
       "code"
      ]
     },
     {
      "label": "Cancel button label",
      "importance": "low",
      "name": "cancelLabel",
      "type": "text",
      "default": "Cancel"
     },
     {
      "label": "Confirm button label",
      "importance": "low",
      "name": "confirmLabel",
      "type": "text",
      "default": "Confirm"
     }
    ]
   }
  ],
  "deps": [
   "FontAwesome 4.5 preloaded",
   "H5P.JoubelUI 1.3 preloaded",
   "H5P.Question 1.5 preloaded",
   "H5PEditor.RangeList 1.0 editor",
   "H5PEditor.ShowWhen 1.0 editor"
  ]
 },
 "H5P.DragQuestion": {
  "version": "1.14",
  "semantics": [
   {
    "name": "scoreShow",
    "type": "text",
    "label": "Check answer button",
    "importance": "low",
    "default": "Check",
    "common": true
   },
   {
    "name": "submit",
    "type": "text",
    "label": "Submit answer button",
    "importance": "low",
    "default": "Submit",
    "common": true
   },
   {
    "name": "tryAgain",
    "type": "text",
    "label": "Retry button",
    "importance": "low",
    "default": "Retry",
    "common": true,
    "optional": true
   },
   {
    "label": "Score explanation text",
    "importance": "low",
    "name": "scoreExplanation",
    "type": "text",
    "default": "Correct answers give +1 point. Incorrect answers give -1 point. The lowest possible score is 0.",
    "common": true,
    "optional": true
   },
   {
    "name": "question",
    "importance": "high",
    "type": "group",
    "widget": "wizard",
    "fields": [
     {
      "name": "settings",
      "type": "group",
      "label": "Settings",
      "importance": "high",
      "fields": [
       {
        "name": "background",
        "type": "image",
        "label": "Background image",
        "importance": "low",
        "optional": true,
        "description": "Optional. Select an image to use as background for your drag and drop task."
       },
       {
        "name": "size",
        "type": "group",
        "widget": "dimensions",
        "label": "Task size",
        "importance": "low",
        "description": "Specify how large (in px) the play area should be.",
        "default": {
         "width": 620,
         "height": 310,
         "field": "background"
        },
        "fields": [
         {
          "name": "width",
          "type": "number"
         },
         {
          "name": "height",
          "type": "number"
         }
        ]
       }
      ]
     },
     {
      "name": "task",
      "type": "group",
      "widget": "dragQuestion",
      "label": "Task",
      "importance": "high",
      "description": "Start by placing your drop zones.<br/>Next, place your droppable elements and check off the appropriate drop zones.<br/>Last, edit your drop zone again and check off the correct answers.",
      "fields": [
       {
        "name": "elements",
        "type": "list",
        "label": "Elements",
        "importance": "high",
        "entity": "element",
        "field": {
         "type": "group",
         "label": "Element",
         "importance": "high",
         "fields": [
          {
           "name": "type",
           "type": "library",
           "description": "Choose the type of content you would like to add.",
           "importance": "medium",
           "options": [
            "H5P.AdvancedText 1.1",
            "H5P.Image 1.1"
           ]
          },
          {
           "name": "x",
           "type": "number",
           "widget": "none"
          },
          {
           "name": "y",
           "type": "number",
           "widget": "none"
          },
          {
           "name": "height",
           "type": "number",
           "widget": "none"
          },
          {
           "name": "width",
           "type": "number",
           "widget": "none"
          },
          {
           "name": "dropZones",
           "type": "select",
           "widget": "dynamicCheckboxes",
           "label": "Select drop zones",
           "importance": "high",
           "multiple": true
          },
          {
           "name": "backgroundOpacity",
           "type": "number",
           "label": "Background Opacity",
           "importance": "low",
           "min": 0,
           "max": 100,
           "step": 5,
           "default": 100,
           "description": "Reducing the opacity may result in an insufficient contrast and make the content not accessible.",
           "optional": true
          },
          {
           "name": "multiple",
           "type": "boolean",
           "label": "Infinite number of element instances",
           "importance": "low",
           "description": "Clones this element so that it can be dragged to multiple drop zones.",
           "default": false
          }
         ]
        }
       },
       {
        "name": "dropZones",
        "type": "list",
        "label": "Drop Zones",
        "importance": "high",
        "entity": "Drop Zone",
        "field": {
         "type": "group",
         "label": "Drop Zone",
         "importance": "high",
         "fields": [
          {
           "name": "label",
           "type": "text",
           "widget": "html",
           "label": "Label",
           "importance": "medium",
           "description": "The label is used by assistive technologies.",
           "enterMode": "div",
           "tags": [
            "strong",
            "em",
            "del",
            "code"
           ]
          },
          {
           "name": "showLabel",
           "type": "boolean",
           "label": "Show label",
           "importance": "low"
          },
          {
           "name": "x",
           "type": "number",
           "widget": "none"
          },
          {
           "name": "y",
           "type": "number",
           "widget": "none"
          },
          {
           "name": "height",
           "type": "number",
           "widget": "none"
          },
          {
           "name": "width",
           "type": "number",
           "widget": "none"
          },
          {
           "name": "correctElements",
           "type": "select",
           "widget": "dynamicCheckboxes",
           "label": "Select correct elements",
           "importance": "low",
           "multiple": true
          },
          {
           "name": "backgroundOpacity",
           "type": "number",
           "label": "Background Opacity",
           "importance": "low",
           "min": 0,
           "max": 100,
           "step": 5,
           "default": 100,
           "description": "Reducing the opacity may result in an insufficient contrast and make the content not accessible.",
           "optional": true
          },
          {
           "name": "tipsAndFeedback",
           "type": "group",
           "label": "Tips and feedback",
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
            },
            {
             "name": "feedbackOnCorrect",
             "type": "text",
             "label": "Message displayed on correct match",
             "importance": "low",
             "description": "Message will appear below the task on \"check\" if correct droppable is matched.",
             "optional": true
            },
            {
             "name": "feedbackOnIncorrect",
             "type": "text",
             "label": "Message displayed on incorrect match",
             "importance": "low",
             "description": "Message will appear below the task on \"check\" if the match is incorrect.",
             "optional": true
            }
           ]
          },
          {
           "name": "single",
           "type": "boolean",
           "label": "This drop zone can only contain one element",
           "description": "Make sure there is only one correct answer for this dropzone",
           "importance": "low",
           "default": false
          },
          {
           "name": "autoAlign",
           "type": "boolean",
           "label": "Enable Auto-Align",
           "importance": "low",
           "description": "Will auto-align all draggables dropped in this zone."
          }
         ]
        }
       }
      ]
     }
    ]
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
      "name": "enableCheckButton",
      "type": "boolean",
      "label": "Enable \"Check\" button",
      "widget": "none",
      "importance": "low",
      "default": true,
      "optional": true
     },
     {
      "name": "singlePoint",
      "type": "boolean",
      "label": "Give one point for the whole task",
      "importance": "low",
      "description": "Disable to give one point for each draggable that is placed correctly.",
      "default": false
     },
     {
      "label": "Apply penalties",
      "name": "applyPenalties",
      "type": "boolean",
      "description": "Apply penalties for elements dropped in the wrong drop zones. This must be enabled when the same element(s) are able to be dropped into multiple drop zones, or if there is only one drop-zone. If this is not enabled, learners may match all items to all drop-zones and always receive a full score.",
      "default": true
     },
     {
      "name": "enableScoreExplanation",
      "type": "boolean",
      "label": "Enable score explanation",
      "description": "Display a score explanation to user when checking their answers (if the 'Apply penalties' option has been selected).",
      "importance": "low",
      "default": true,
      "optional": true,
      "widget": "showWhen",
      "showWhen": {
       "rules": [
        {
         "field": "singlePoint",
         "equals": false
        }
       ]
      }
     },
     {
      "name": "backgroundOpacity",
      "type": "text",
      "label": "Background opacity for draggables",
      "importance": "low",
      "description": "If this field is set, it will override opacity set on all draggable elements. This should be a number between 0 and 100, where 0 means full transparency and 100 means no transparency",
      "optional": true
     },
     {
      "name": "dropZoneHighlighting",
      "type": "select",
      "label": "Drop Zone Highlighting",
      "importance": "low",
      "description": "Choose when to highlight drop zones.",
      "default": "dragging",
      "options": [
       {
        "value": "dragging",
        "label": "When dragging"
       },
       {
        "value": "always",
        "label": "Always"
       },
       {
        "value": "never",
        "label": "Never"
       }
      ]
     },
     {
      "name": "autoAlignSpacing",
      "type": "number",
      "label": "Spacing for Auto-Align (in px)",
      "importance": "low",
      "min": 0,
      "default": 2,
      "optional": true
     },
     {
      "name": "enableFullScreen",
      "label": "Enable FullScreen",
      "importance": "low",
      "type": "boolean",
      "description": "Check this option to enable the full screen button.",
      "default": false
     },
     {
      "name": "showScorePoints",
      "type": "boolean",
      "label": "Show score points",
      "description": "Show points earned for each answer. Not available when the 'Give one point for the whole task' option is enabled.",
      "importance": "low",
      "default": true
     },
     {
      "name": "showTitle",
      "type": "boolean",
      "label": "Show Title",
      "importance": "low",
      "description": "Uncheck this option if you do not want this title to be displayed. The title will only be displayed in summaries, statistics etc.",
      "default": true
     }
    ]
   },
   {
    "name": "localize",
    "type": "group",
    "label": "Localize",
    "common": true,
    "fields": [
     {
      "name": "fullscreen",
      "type": "text",
      "label": "Fullscreen label",
      "default": "Fullscreen"
     },
     {
      "name": "exitFullscreen",
      "type": "text",
      "label": "Exit fullscreen label",
      "default": "Exit fullscreen"
     }
    ]
   },
   {
    "name": "grabbablePrefix",
    "type": "text",
    "label": "Grabbable prefix",
    "importance": "low",
    "default": "Grabbable {num} of {total}.",
    "common": true
   },
   {
    "name": "grabbableSuffix",
    "type": "text",
    "label": "Grabbable suffix",
    "importance": "low",
    "default": "Placed in dropzone {num}.",
    "common": true
   },
   {
    "name": "dropzonePrefix",
    "type": "text",
    "label": "Dropzone prefix",
    "importance": "low",
    "default": "Dropzone {num} of {total}.",
    "common": true
   },
   {
    "name": "noDropzone",
    "type": "text",
    "label": "No dropzone selection label",
    "importance": "low",
    "default": "No dropzone.",
    "common": true
   },
   {
    "name": "tipLabel",
    "type": "text",
    "label": "Label for show tip button",
    "importance": "low",
    "default": "Show tip.",
    "common": true
   },
   {
    "name": "tipAvailable",
    "type": "text",
    "label": "Label for tip available",
    "importance": "low",
    "default": "Tip available",
    "common": true
   },
   {
    "name": "correctAnswer",
    "type": "text",
    "label": "Label for correct answer",
    "importance": "low",
    "default": "Correct answer",
    "common": true
   },
   {
    "name": "wrongAnswer",
    "type": "text",
    "label": "Label for incorrect answer",
    "importance": "low",
    "default": "Wrong answer",
    "common": true
   },
   {
    "name": "feedbackHeader",
    "type": "text",
    "label": "Header for panel containing feedback for correct/incorrect answers",
    "importance": "low",
    "default": "Feedback",
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
    "name": "scoreExplanationButtonLabel",
    "type": "text",
    "label": "Textual representation of the score explanation button",
    "default": "Show score explanation",
    "importance": "low",
    "common": true
   },
   {
    "name": "a11yCheck",
    "type": "text",
    "label": "Assistive technology label for \"Check\" button",
    "default": "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
    "importance": "low",
    "common": true
   },
   {
    "name": "a11yRetry",
    "type": "text",
    "label": "Assistive technology label for \"Retry\" button",
    "default": "Retry the task. Reset all responses and start the task over again.",
    "importance": "low",
    "common": true
   }
  ],
  "deps": [
   "FontAwesome 4.5 preloaded",
   "jQuery.ui 1.10 preloaded",
   "H5P.JoubelUI 1.3 preloaded",
   "H5P.Question 1.5 preloaded",
   "H5PEditor.DragQuestion 1.10 editor",
   "H5PEditor.RangeList 1.0 editor",
   "H5PEditor.ShowWhen 1.0 editor"
  ]
 },
 "H5P.DragText": {
  "version": "1.10",
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
    "default": "Drag the words into the correct boxes",
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
    "label": "Text",
    "importance": "high",
    "name": "textField",
    "type": "text",
    "widget": "textarea",
    "placeholder": "*Oslo* is the capital of Norway, *Stockholm* is the capital of Sweden and *Copenhagen* is the capital of Denmark. All cities are located in the *Scandinavian:Northern Part of Europe* peninsula.",
    "description": "",
    "important": {
     "description": "<ul><li>Droppable words are added with an asterisk (*) in front and behind the correct word/phrase.</li><li>You may add a textual tip, using a colon (:) in front of the tip.</li><li>For every empty spot there is only one correct word.</li><li>You may add feedback to be displayed when a task is completed. Use '\\+' for correct and '\\-' for incorrect feedback.</li></ul>",
     "example": "H5P content may be edited using a *browser:What type of program is Chrome?*. </br> H5P content is *interactive\\+Correct! \\-Incorrect, try again!*"
    }
   },
   {
    "label": "Distractors",
    "importance": "high",
    "name": "distractors",
    "type": "text",
    "optional": true,
    "placeholder": "*Reykjavík* *Helsinki*",
    "description": "Enter extra solutions that are wrong as distractors. Use the same asterisk (*) scheme as for the text."
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
    "name": "checkAnswer",
    "type": "text",
    "default": "Check",
    "common": true
   },
   {
    "label": "Text for \"Submit\" button",
    "importance": "low",
    "name": "submitAnswer",
    "type": "text",
    "default": "Submit",
    "common": true
   },
   {
    "label": "Text for \"Retry\" button",
    "importance": "low",
    "name": "tryAgain",
    "type": "text",
    "default": "Retry",
    "common": true
   },
   {
    "label": "Text for \"Show Solution\" button",
    "importance": "low",
    "name": "showSolution",
    "type": "text",
    "default": "Show solution",
    "common": true
   },
   {
    "label": "Numbered Drop zone label",
    "importance": "low",
    "name": "dropZoneIndex",
    "type": "text",
    "default": "Drop Zone @index.",
    "description": "Label used for accessibility, where the Read speaker will read the index of a drop zone. Variable available: @index",
    "common": true
   },
   {
    "label": "Empty Drop Zone label",
    "importance": "low",
    "name": "empty",
    "type": "text",
    "default": "Drop Zone @index is empty.",
    "description": "Label used for accessibility, where the Read speaker will read that the drop zone is empty",
    "common": true
   },
   {
    "label": "Contains Drop Zone label",
    "importance": "low",
    "name": "contains",
    "type": "text",
    "default": "Drop Zone @index contains draggable @draggable.",
    "description": "Label used for accessibility, where the Read speaker will read that the drop zone contains a draggable",
    "common": true
   },
   {
    "label": "Draggable elements label",
    "importance": "low",
    "name": "ariaDraggableIndex",
    "type": "text",
    "default": "@index of @count draggables.",
    "description": "Label used for accessibility, where the Read speaker reads that this is a draggable element. Variable available: @index, @count",
    "common": true
   },
   {
    "label": "Label for show tip button",
    "importance": "low",
    "name": "tipLabel",
    "type": "text",
    "default": "Show tip",
    "description": "Label used for accessibility, where the Read speaker reads it before the tip is read out",
    "common": true
   },
   {
    "name": "correctText",
    "type": "text",
    "label": "Readspeaker text for correct answer",
    "importance": "low",
    "default": "Correct!",
    "common": true
   },
   {
    "name": "incorrectText",
    "type": "text",
    "label": "Readspeaker text for incorrect answer",
    "importance": "low",
    "default": "Incorrect!",
    "common": true
   },
   {
    "name": "resetDropTitle",
    "type": "text",
    "label": "Confirmation dialog title that user wants to reset a droppable",
    "importance": "low",
    "default": "Reset drop",
    "common": true
   },
   {
    "name": "resetDropDescription",
    "type": "text",
    "label": "Confirmation dialog description that user wants to reset a droppable",
    "importance": "low",
    "default": "Are you sure you want to reset this drop zone?",
    "common": true
   },
   {
    "name": "grabbed",
    "type": "text",
    "label": "Label used for accessibility, where the read speaker indicates that dragging is initiated",
    "importance": "low",
    "default": "Draggable is grabbed.",
    "common": true
   },
   {
    "name": "cancelledDragging",
    "type": "text",
    "label": "Label used for accessibility, where the read speaker indicates that dragging is canceled",
    "importance": "low",
    "default": "Cancelled dragging.",
    "common": true
   },
   {
    "name": "correctAnswer",
    "type": "text",
    "label": "Label used for accessibility, where the read speaker indicates that a text is the correct answer",
    "importance": "low",
    "default": "Correct answer:",
    "common": true
   },
   {
    "name": "feedbackHeader",
    "type": "text",
    "label": "Header for panel containing feedback for correct/incorrect answers",
    "importance": "low",
    "default": "Feedback",
    "common": true
   },
   {
    "name": "behaviour",
    "type": "group",
    "label": "Behavioural settings.",
    "importance": "low",
    "description": "These options will let you control how the task behaves.",
    "optional": true,
    "fields": [
     {
      "label": "Enable \"Retry\"",
      "importance": "low",
      "name": "enableRetry",
      "type": "boolean",
      "default": true
     },
     {
      "label": "Enable \"Show Solution\" button",
      "importance": "low",
      "name": "enableSolutionsButton",
      "type": "boolean",
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
      "label": "Instant feedback",
      "importance": "low",
      "name": "instantFeedback",
      "type": "boolean",
      "default": false,
      "optional": true
     }
    ]
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
    "name": "a11yCheck",
    "type": "text",
    "label": "Assistive technology label for \"Check\" button",
    "default": "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
    "importance": "low",
    "common": true
   },
   {
    "name": "a11yShowSolution",
    "type": "text",
    "label": "Assistive technology label for \"Show Solution\" button",
    "default": "Show the solution. The task will be marked with its correct solution.",
    "importance": "low",
    "common": true
   },
   {
    "name": "a11yRetry",
    "type": "text",
    "label": "Assistive technology label for \"Retry\" button",
    "default": "Retry the task. Reset all responses and start the task over again.",
    "importance": "low",
    "common": true
   }
  ],
  "deps": [
   "FontAwesome 4.5 preloaded",
   "jQuery.ui 1.10 preloaded",
   "H5P.JoubelUI 1.3 preloaded",
   "H5P.Question 1.5 preloaded",
   "H5PEditor.RangeList 1.0 editor",
   "H5PEditor.ShowWhen 1.0 editor"
  ]
 },
 "H5P.TrueFalse": {
  "version": "1.8",
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
    "name": "question",
    "type": "text",
    "widget": "html",
    "label": "Question",
    "importance": "high",
    "enterMode": "p",
    "tags": [
     "strong",
     "em",
     "sub",
     "sup",
     "h2",
     "h3",
     "pre",
     "code"
    ]
   },
   {
    "name": "correct",
    "type": "select",
    "widget": "radioGroup",
    "alignment": "horizontal",
    "label": "Correct answer",
    "importance": "high",
    "options": [
     {
      "value": "true",
      "label": "True"
     },
     {
      "value": "false",
      "label": "False"
     }
    ],
    "default": "true"
   },
   {
    "name": "l10n",
    "type": "group",
    "common": true,
    "label": "User interface translations for True/False Questions",
    "importance": "low",
    "fields": [
     {
      "name": "trueText",
      "type": "text",
      "label": "Label for true button",
      "importance": "low",
      "default": "True"
     },
     {
      "name": "falseText",
      "type": "text",
      "label": "Label for false button",
      "importance": "low",
      "default": "False"
     },
     {
      "label": "Feedback text",
      "importance": "low",
      "name": "score",
      "type": "text",
      "default": "You got @score of @total points",
      "description": "Feedback text, variables available: @score and @total. Example: 'You got @score of @total possible points'"
     },
     {
      "label": "Text for \"Check\" button",
      "importance": "low",
      "name": "checkAnswer",
      "type": "text",
      "default": "Check"
     },
     {
      "label": "Text for \"Submit\" button",
      "importance": "low",
      "name": "submitAnswer",
      "type": "text",
      "default": "Submit"
     },
     {
      "label": "Text for \"Show solution\" button",
      "importance": "low",
      "name": "showSolutionButton",
      "type": "text",
      "default": "Show solution"
     },
     {
      "label": "Text for \"Retry\" button",
      "importance": "low",
      "name": "tryAgain",
      "type": "text",
      "default": "Retry"
     },
     {
      "name": "wrongAnswerMessage",
      "type": "text",
      "label": "Wrong Answer",
      "importance": "low",
      "default": "Wrong answer"
     },
     {
      "name": "correctAnswerMessage",
      "type": "text",
      "label": "Correct Answer",
      "importance": "low",
      "default": "Correct answer"
     },
     {
      "name": "scoreBarLabel",
      "type": "text",
      "label": "Textual representation of the score bar for those using a readspeaker",
      "default": "You got :num out of :total points",
      "importance": "low"
     },
     {
      "name": "a11yCheck",
      "type": "text",
      "label": "Assistive technology description for \"Check\" button",
      "default": "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
      "importance": "low"
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
   },
   {
    "name": "behaviour",
    "type": "group",
    "label": "Behavioural settings",
    "importance": "low",
    "description": "These options will let you control how the task behaves.",
    "fields": [
     {
      "name": "enableRetry",
      "type": "boolean",
      "label": "Enable \"Retry\" button",
      "importance": "low",
      "default": true
     },
     {
      "name": "enableSolutionsButton",
      "type": "boolean",
      "label": "Enable \"Show Solution\" button",
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
      "label": "Show confirmation dialog on \"Check\"",
      "importance": "low",
      "name": "confirmCheckDialog",
      "type": "boolean",
      "default": false
     },
     {
      "label": "Show confirmation dialog on \"Retry\"",
      "importance": "low",
      "name": "confirmRetryDialog",
      "type": "boolean",
      "default": false
     },
     {
      "label": "Automatically check answer",
      "importance": "low",
      "description": "Note that accessibility will suffer if enabling this option",
      "name": "autoCheck",
      "type": "boolean",
      "default": false
     },
     {
      "name": "feedbackOnCorrect",
      "label": "Feedback on correct answer",
      "importance": "low",
      "description": "This will override the default feedback text. Variables available: @score and @total",
      "type": "text",
      "maxLength": 2048,
      "optional": true
     },
     {
      "name": "feedbackOnWrong",
      "label": "Feedback on wrong answer",
      "importance": "low",
      "description": "This will override the default feedback text. Variables available: @score and @total",
      "type": "text",
      "maxLength": 2048,
      "optional": true
     }
    ]
   },
   {
    "label": "Check confirmation dialog",
    "importance": "low",
    "name": "confirmCheck",
    "type": "group",
    "common": true,
    "fields": [
     {
      "label": "Header text",
      "importance": "low",
      "name": "header",
      "type": "text",
      "default": "Finish ?"
     },
     {
      "label": "Body text",
      "importance": "low",
      "name": "body",
      "type": "text",
      "default": "Are you sure you wish to finish ?",
      "widget": "html",
      "enterMode": "p",
      "tags": [
       "strong",
       "em",
       "del",
       "u",
       "code"
      ]
     },
     {
      "label": "Cancel button label",
      "importance": "low",
      "name": "cancelLabel",
      "type": "text",
      "default": "Cancel"
     },
     {
      "label": "Confirm button label",
      "importance": "low",
      "name": "confirmLabel",
      "type": "text",
      "default": "Finish"
     }
    ]
   },
   {
    "label": "Retry confirmation dialog",
    "importance": "low",
    "name": "confirmRetry",
    "type": "group",
    "common": true,
    "fields": [
     {
      "label": "Header text",
      "importance": "low",
      "name": "header",
      "type": "text",
      "default": "Retry ?"
     },
     {
      "label": "Body text",
      "importance": "low",
      "name": "body",
      "type": "text",
      "default": "Are you sure you wish to retry ?",
      "widget": "html",
      "enterMode": "p",
      "tags": [
       "strong",
       "em",
       "del",
       "u",
       "code"
      ]
     },
     {
      "label": "Cancel button label",
      "importance": "low",
      "name": "cancelLabel",
      "type": "text",
      "default": "Cancel"
     },
     {
      "label": "Confirm button label",
      "importance": "low",
      "name": "confirmLabel",
      "type": "text",
      "default": "Confirm"
     }
    ]
   }
  ],
  "deps": [
   "FontAwesome 4.5 preloaded",
   "H5P.Question 1.5 preloaded",
   "H5P.JoubelUI 1.3 preloaded",
   "H5P.FontIcons 1.0 preloaded",
   "H5PEditor.RadioGroup 1.1 editor",
   "H5PEditor.ShowWhen 1.0 editor"
  ]
 },
 "H5P.Blanks": {
  "version": "1.14",
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
    "name": "text",
    "type": "text",
    "widget": "html",
    "default": "Fill in the missing words",
    "description": "A guide telling the user how to answer this task.",
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
    "name": "questions",
    "type": "list",
    "label": "Text blocks",
    "importance": "high",
    "entity": "text block",
    "min": 1,
    "max": 31,
    "field": {
     "name": "question",
     "type": "text",
     "widget": "html",
     "label": "Line of text",
     "importance": "high",
     "placeholder": "Oslo is the capital of *Norway*.",
     "description": "",
     "important": {
      "description": "<ul><li>Blanks are added with an asterisk (*) in front and behind the correct word/phrase.</li><li>Alternative answers are separated with a forward slash (/).</li><li>You may add a textual tip, using a colon (:) in front of the tip.</li></ul>",
      "example": "H5P content may be edited using a *browser/web-browser:Something you use every day*."
     },
     "enterMode": "p",
     "tags": [
      "strong",
      "em",
      "del",
      "u",
      "code"
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
    "label": "Text for \"Show solutions\" button",
    "name": "showSolutions",
    "type": "text",
    "default": "Show solution",
    "common": true
   },
   {
    "label": "Text for \"Retry\" button",
    "importance": "low",
    "name": "tryAgain",
    "type": "text",
    "default": "Retry",
    "common": true,
    "optional": true
   },
   {
    "label": "Text for \"Check\" button",
    "importance": "low",
    "name": "checkAnswer",
    "type": "text",
    "default": "Check",
    "common": true,
    "optional": true
   },
   {
    "label": "Text for \"Submit\" button",
    "importance": "low",
    "name": "submitAnswer",
    "type": "text",
    "default": "Submit",
    "common": true,
    "optional": true
   },
   {
    "label": "Text for \"Not filled out\" message",
    "importance": "low",
    "name": "notFilledOut",
    "type": "text",
    "default": "Please fill in all blanks to view solution",
    "common": true,
    "optional": true
   },
   {
    "label": "Text for \"':ans' is correct\" message",
    "importance": "low",
    "name": "answerIsCorrect",
    "type": "text",
    "default": "':ans' is correct",
    "common": true,
    "optional": true
   },
   {
    "label": "Text for \"':ans' is wrong\" message",
    "importance": "low",
    "name": "answerIsWrong",
    "type": "text",
    "default": "':ans' is wrong",
    "common": true,
    "optional": true
   },
   {
    "label": "Text for \"Answered correctly\" message",
    "importance": "low",
    "name": "answeredCorrectly",
    "type": "text",
    "default": "Answered correctly",
    "common": true,
    "optional": true
   },
   {
    "label": "Text for \"Answered incorrectly\" message",
    "importance": "low",
    "name": "answeredIncorrectly",
    "type": "text",
    "default": "Answered incorrectly",
    "common": true,
    "optional": true
   },
   {
    "label": "Assistive technology label for solution",
    "importance": "low",
    "name": "solutionLabel",
    "type": "text",
    "default": "Correct answer:",
    "common": true,
    "optional": true
   },
   {
    "label": "Assistive technology label for input field",
    "importance": "low",
    "name": "inputLabel",
    "type": "text",
    "description": "Use @num and @total to replace current cloze number and total cloze number",
    "default": "Blank input @num of @total",
    "common": true,
    "optional": true
   },
   {
    "label": "Assistive technology label for saying an input has a tip tied to it",
    "importance": "low",
    "name": "inputHasTipLabel",
    "type": "text",
    "default": "Tip available",
    "common": true,
    "optional": true
   },
   {
    "label": "Tip icon label",
    "importance": "low",
    "name": "tipLabel",
    "type": "text",
    "default": "Tip",
    "common": true,
    "optional": true
   },
   {
    "name": "behaviour",
    "type": "group",
    "label": "Behavioural settings.",
    "importance": "low",
    "description": "These options will let you control how the task behaves.",
    "optional": true,
    "fields": [
     {
      "label": "Enable \"Retry\"",
      "importance": "low",
      "name": "enableRetry",
      "type": "boolean",
      "default": true,
      "optional": true
     },
     {
      "label": "Enable \"Show solution\" button",
      "importance": "low",
      "name": "enableSolutionsButton",
      "type": "boolean",
      "default": true,
      "optional": true
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
      "label": "Automatically check answers after input",
      "importance": "low",
      "name": "autoCheck",
      "type": "boolean",
      "default": false,
      "optional": true
     },
     {
      "name": "caseSensitive",
      "importance": "low",
      "type": "boolean",
      "default": true,
      "label": "Case sensitive",
      "description": "Makes sure the user input has to be exactly the same as the answer."
     },
     {
      "label": "Require all fields to be answered before the solution can be viewed",
      "importance": "low",
      "name": "showSolutionsRequiresInput",
      "type": "boolean",
      "default": true,
      "optional": true
     },
     {
      "label": "Put input fields on separate lines",
      "importance": "low",
      "name": "separateLines",
      "type": "boolean",
      "default": false,
      "optional": true
     },
     {
      "label": "Show confirmation dialog on \"Check\"",
      "importance": "low",
      "name": "confirmCheckDialog",
      "type": "boolean",
      "description": "This options is not compatible with the \"Automatically check answers after input\" option",
      "default": false
     },
     {
      "label": "Show confirmation dialog on \"Retry\"",
      "importance": "low",
      "name": "confirmRetryDialog",
      "type": "boolean",
      "default": false
     },
     {
      "name": "acceptSpellingErrors",
      "type": "boolean",
      "label": "Accept minor spelling errors",
      "importance": "low",
      "description": "If activated, an answer will also count as correct with minor spelling errors (3-9 characters: 1 spelling error, more than 9 characters: 2 spelling errors)",
      "default": false,
      "optional": true
     }
    ]
   },
   {
    "label": "Check confirmation dialog",
    "importance": "low",
    "name": "confirmCheck",
    "type": "group",
    "common": true,
    "fields": [
     {
      "label": "Header text",
      "importance": "low",
      "name": "header",
      "type": "text",
      "default": "Finish ?"
     },
     {
      "label": "Body text",
      "importance": "low",
      "name": "body",
      "type": "text",
      "default": "Are you sure you wish to finish ?",
      "widget": "html",
      "enterMode": "p",
      "tags": [
       "strong",
       "em",
       "del",
       "u",
       "code"
      ]
     },
     {
      "label": "Cancel button label",
      "importance": "low",
      "name": "cancelLabel",
      "type": "text",
      "default": "Cancel"
     },
     {
      "label": "Confirm button label",
      "importance": "low",
      "name": "confirmLabel",
      "type": "text",
      "default": "Finish"
     }
    ]
   },
   {
    "label": "Retry confirmation dialog",
    "importance": "low",
    "name": "confirmRetry",
    "type": "group",
    "common": true,
    "fields": [
     {
      "label": "Header text",
      "importance": "low",
      "name": "header",
      "type": "text",
      "default": "Retry ?"
     },
     {
      "label": "Body text",
      "importance": "low",
      "name": "body",
      "type": "text",
      "default": "Are you sure you wish to retry ?",
      "widget": "html",
      "enterMode": "p",
      "tags": [
       "strong",
       "em",
       "del",
       "u",
       "code"
      ]
     },
     {
      "label": "Cancel button label",
      "importance": "low",
      "name": "cancelLabel",
      "type": "text",
      "default": "Cancel"
     },
     {
      "label": "Confirm button label",
      "importance": "low",
      "name": "confirmLabel",
      "type": "text",
      "default": "Confirm"
     }
    ]
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
   },
   {
    "name": "a11yCheckingModeHeader",
    "type": "text",
    "label": "Assistive technology description for starting task",
    "default": "Checking mode",
    "importance": "low",
    "common": true
   }
  ],
  "deps": [
   "FontAwesome 4.5 preloaded",
   "H5P.Question 1.5 preloaded",
   "H5P.JoubelUI 1.3 preloaded",
   "H5P.TextUtilities 1.3 preloaded",
   "H5PEditor.RangeList 1.0 editor",
   "H5PEditor.ShowWhen 1.0 editor"
  ]
 },
 "H5P.QuestionSet": {
  "version": "1.20",
  "semantics": [
   {
    "name": "introPage",
    "type": "group",
    "label": "Quiz introduction",
    "importance": "medium",
    "fields": [
     {
      "name": "showIntroPage",
      "type": "boolean",
      "label": "Display introduction",
      "importance": "low"
     },
     {
      "name": "title",
      "type": "text",
      "label": "Title",
      "importance": "high",
      "optional": true,
      "description": "This title will be displayed above the introduction text.",
      "tags": [
       "sub",
       "sup",
       "strong",
       "em",
       "code"
      ]
     },
     {
      "name": "introduction",
      "type": "text",
      "widget": "html",
      "label": "Introduction text",
      "importance": "medium",
      "optional": true,
      "description": "This text will be displayed before the quiz starts.",
      "enterMode": "p",
      "tags": [
       "sub",
       "sup",
       "strong",
       "em",
       "p",
       "code"
      ]
     },
     {
      "name": "startButtonText",
      "type": "text",
      "label": "Start button text",
      "importance": "low",
      "optional": true,
      "default": "Start Quiz"
     },
     {
      "name": "backgroundImage",
      "type": "image",
      "label": "Background image",
      "importance": "low",
      "optional": true,
      "description": "An optional background image for the introduction."
     }
    ]
   },
   {
    "name": "backgroundImage",
    "type": "image",
    "label": "Background image",
    "importance": "low",
    "optional": true,
    "description": "An optional background image for the Question set."
   },
   {
    "name": "progressType",
    "type": "select",
    "label": "Progress indicator",
    "importance": "low",
    "description": "Question set progress indicator style.",
    "options": [
     {
      "value": "textual",
      "label": "Textual"
     },
     {
      "value": "dots",
      "label": "Dots"
     }
    ],
    "default": "dots"
   },
   {
    "name": "passPercentage",
    "type": "number",
    "label": "Pass percentage",
    "importance": "low",
    "description": "Percentage of Total score required for passing the quiz.",
    "min": 0,
    "max": 100,
    "step": 1,
    "default": 50
   },
   {
    "name": "questions",
    "label": "Questions",
    "importance": "high",
    "type": "list",
    "widgets": [
     {
      "name": "VerticalTabs",
      "label": "Default"
     },
     {
      "name": "QuestionSetTextualEditor",
      "label": "Textual"
     }
    ],
    "min": 1,
    "entity": "question",
    "field": {
     "name": "question",
     "type": "library",
     "label": "Question type",
     "importance": "high",
     "description": "Library for this question.",
     "options": [
      "H5P.MultiChoice 1.16",
      "H5P.DragQuestion 1.14",
      "H5P.Blanks 1.14",
      "H5P.MarkTheWords 1.11",
      "H5P.DragText 1.10",
      "H5P.TrueFalse 1.8",
      "H5P.Essay 1.5",
      "H5P.MultiMediaChoice 0.3"
     ]
    }
   },
   {
    "name": "texts",
    "type": "group",
    "label": "Interface texts in quiz",
    "importance": "low",
    "common": true,
    "fields": [
     {
      "name": "prevButton",
      "type": "text",
      "label": "Back button",
      "importance": "low",
      "default": "Previous question"
     },
     {
      "name": "nextButton",
      "type": "text",
      "label": "Next button",
      "importance": "low",
      "default": "Next question"
     },
     {
      "name": "finishButton",
      "type": "text",
      "label": "Finish button",
      "importance": "low",
      "default": "Finish"
     },
     {
      "name": "submitButton",
      "type": "text",
      "label": "Submit button",
      "importance": "low",
      "default": "Submit"
     },
     {
      "name": "textualProgress",
      "type": "text",
      "label": "Progress text",
      "importance": "low",
      "description": "Text used if textual progress is selected.",
      "default": "Question: @current of @total questions",
      "tags": [
       "strong",
       "em",
       "code"
      ]
     },
     {
      "name": "jumpToQuestion",
      "type": "text",
      "label": "Label for jumping to a certain question",
      "importance": "low",
      "description": "You must use the placeholder '%d' instead of the question number, and %total instead of total amount of questions.",
      "default": "Question %d of %total"
     },
     {
      "name": "questionLabel",
      "type": "text",
      "label": "Copyright dialog question label",
      "importance": "low",
      "default": "Question"
     },
     {
      "name": "readSpeakerProgress",
      "type": "text",
      "label": "Readspeaker progress",
      "importance": "low",
      "description": "May use @current and @total question variables",
      "default": "Question @current of @total"
     },
     {
      "name": "unansweredText",
      "type": "text",
      "label": "Unanswered question text",
      "importance": "low",
      "default": "Unanswered"
     },
     {
      "name": "answeredText",
      "type": "text",
      "label": "Answered question text",
      "importance": "low",
      "default": "Answered"
     },
     {
      "name": "currentQuestionText",
      "type": "text",
      "label": "Current question text",
      "importance": "low",
      "default": "Current question"
     },
     {
      "name": "navigationLabel",
      "type": "text",
      "label": "Navigation label for readspeakers",
      "importance": "low",
      "default": "Questions"
     },
     {
      "name": "questionSetInstruction",
      "type": "text",
      "label": "Instruction for navigating question set with screenreader",
      "importance": "low",
      "default": "Choose question to display",
      "state": "new"
     }
    ]
   },
   {
    "name": "disableBackwardsNavigation",
    "type": "boolean",
    "label": "Disable backwards navigation",
    "importance": "low",
    "description": "This option will only allow you to move forward in Question Set",
    "optional": true,
    "default": false
   },
   {
    "name": "randomQuestions",
    "type": "boolean",
    "label": "Randomize questions",
    "importance": "low",
    "description": "Enable to randomize the order of questions on display.",
    "default": false
   },
   {
    "name": "poolSize",
    "type": "number",
    "min": 1,
    "label": "Number of questions to be shown:",
    "importance": "low",
    "description": "Create a randomized batch of questions from the total.",
    "optional": true
   },
   {
    "name": "endGame",
    "type": "group",
    "label": "Quiz finished",
    "importance": "medium",
    "fields": [
     {
      "name": "showResultPage",
      "type": "boolean",
      "label": "Display results",
      "importance": "low",
      "default": true
     },
     {
      "name": "showSolutionButton",
      "type": "boolean",
      "label": "Display solution button",
      "default": true
     },
     {
      "name": "showRetryButton",
      "type": "boolean",
      "label": "Display retry button",
      "default": true
     },
     {
      "name": "noResultMessage",
      "type": "text",
      "label": "No results message",
      "importance": "low",
      "description": "Text displayed on end page when \"Display results\" is disabled",
      "default": "Finished",
      "optional": true
     },
     {
      "name": "message",
      "type": "text",
      "label": "Feedback heading",
      "importance": "low",
      "default": "Your result:",
      "description": "This heading will be displayed at the end of the quiz when the user has answered all questions.",
      "tags": [
       "strong",
       "em",
       "code"
      ]
     },
     {
      "name": "scoreBarLabel",
      "type": "text",
      "label": "Score announcer",
      "importance": "low",
      "description": "This label will be used for announcing the final score to the user on the end screen",
      "default": "You got @finals out of @totals points"
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
      "name": "oldFeedback",
      "type": "group",
      "label": "Old Feedback",
      "importance": "low",
      "deprecated": true,
      "fields": [
       {
        "name": "successGreeting",
        "type": "text",
        "label": "Quiz passed greeting",
        "importance": "low",
        "optional": true,
        "description": "This text will be displayed above the score if the user has successfully passed the quiz.",
        "tags": [
         "strong",
         "em",
         "code"
        ]
       },
       {
        "name": "successComment",
        "type": "text",
        "widget": "html",
        "label": "Passed comment",
        "importance": "low",
        "optional": true,
        "description": "This comment will be displayed after the score if the user has successfully passed the quiz.",
        "tags": [
         "sub",
         "sup",
         "strong",
         "em",
         "a",
         "p",
         "code"
        ]
       },
       {
        "name": "failGreeting",
        "type": "text",
        "label": "Quiz failed title",
        "importance": "low",
        "optional": true,
        "description": "This text will be displayed above the score if the user has failed the quiz.",
        "tags": [
         "strong",
         "em",
         "code"
        ]
       },
       {
        "name": "failComment",
        "type": "text",
        "widget": "html",
        "label": "Failed comment",
        "importance": "low",
        "optional": true,
        "description": "This comment will be displayed after the score if the user has failed the quiz.",
        "tags": [
         "sub",
         "sup",
         "strong",
         "em",
         "a",
         "p",
         "code"
        ]
       }
      ]
     },
     {
      "name": "solutionButtonText",
      "type": "text",
      "label": "Solution button label",
      "importance": "low",
      "default": "Show solution",
      "description": "Text for the solution button."
     },
     {
      "name": "retryButtonText",
      "type": "text",
      "label": "Retry button label",
      "importance": "low",
      "default": "Retry",
      "description": "Text for the retry button."
     },
     {
      "name": "finishButtonText",
      "type": "text",
      "label": "Finish button text",
      "importance": "low",
      "default": "Finish"
     },
     {
      "name": "submitButtonText",
      "type": "text",
      "label": "Submit button text",
      "importance": "low",
      "default": "Submit"
     },
     {
      "name": "showAnimations",
      "type": "boolean",
      "label": "Display video before quiz results",
      "importance": "low"
     },
     {
      "name": "skippable",
      "type": "boolean",
      "label": "Enable skip video button",
      "importance": "low"
     },
     {
      "name": "skipButtonText",
      "type": "text",
      "label": "Skip video button label",
      "importance": "low",
      "default": "Skip video"
     },
     {
      "name": "successVideo",
      "type": "video",
      "label": "Passed video",
      "importance": "low",
      "optional": true,
      "description": "This video will be played if the user successfully passed the quiz."
     },
     {
      "name": "failVideo",
      "type": "video",
      "label": "Fail video",
      "importance": "low",
      "optional": true,
      "description": "This video will be played if the user fails the quiz."
     }
    ]
   },
   {
    "name": "override",
    "type": "group",
    "label": "Settings for \"Check\", \"Show solution\" and \"Retry\"",
    "importance": "low",
    "optional": true,
    "fields": [
     {
      "name": "checkButton",
      "type": "boolean",
      "label": "Show \"Check\" buttons",
      "importance": "low",
      "description": "This option determines if the \"Check\" button will be shown for all questions.",
      "optional": true,
      "default": true
     },
     {
      "name": "showSolutionButton",
      "type": "select",
      "label": "Override \"Show Solution\" button",
      "importance": "low",
      "description": "This option determines if the \"Show Solution\" button will be shown for all questions, disabled for all or configured for each question individually.",
      "optional": true,
      "widget": "showWhen",
      "showWhen": {
       "rules": [
        {
         "field": "checkButton",
         "equals": true
        }
       ]
      },
      "options": [
       {
        "value": "on",
        "label": "Enabled"
       },
       {
        "value": "off",
        "label": "Disabled"
       }
      ]
     },
     {
      "name": "retryButton",
      "type": "select",
      "label": "Override \"Retry\" button",
      "importance": "low",
      "description": "This option determines if the \"Retry\" button will be shown for all questions, disabled for all or configured for each question individually.",
      "optional": true,
      "widget": "showWhen",
      "showWhen": {
       "rules": [
        {
         "field": "checkButton",
         "equals": true
        }
       ]
      },
      "options": [
       {
        "value": "on",
        "label": "Enabled"
       },
       {
        "value": "off",
        "label": "Disabled"
       }
      ]
     }
    ]
   }
  ],
  "deps": [
   "FontAwesome 4.5 preloaded",
   "H5P.Video 1.6 preloaded",
   "H5P.JoubelUI 1.3 preloaded",
   "H5PEditor.RangeList 1.0 editor",
   "H5PEditor.VerticalTabs 1.3 editor",
   "H5PEditor.QuestionSetTextualEditor 1.3 editor",
   "H5PEditor.ShowWhen 1.0 editor"
  ]
 },
 "H5P.Dialogcards": {
  "version": "1.9",
  "semantics": [
   {
    "name": "title",
    "type": "text",
    "widget": "html",
    "label": "Heading",
    "importance": "high",
    "optional": true,
    "tags": [
     "p",
     "br",
     "strong",
     "em",
     "code"
    ]
   },
   {
    "name": "mode",
    "type": "select",
    "label": "Mode",
    "description": "Mode of presenting the dialog cards",
    "importance": "medium",
    "options": [
     {
      "value": "normal",
      "label": "Normal"
     },
     {
      "value": "repetition",
      "label": "Repetition"
     }
    ],
    "default": "normal"
   },
   {
    "name": "description",
    "type": "text",
    "widget": "html",
    "label": "Task description",
    "importance": "medium",
    "optional": true,
    "tags": [
     "p",
     "br",
     "strong",
     "em",
     "code"
    ]
   },
   {
    "name": "dialogs",
    "type": "list",
    "importance": "high",
    "widgets": [
     {
      "name": "VerticalTabs",
      "label": "Default"
     }
    ],
    "label": "Dialogs",
    "entity": "dialog",
    "min": 1,
    "defaultNum": 1,
    "field": {
     "name": "question",
     "type": "group",
     "label": "Question",
     "importance": "high",
     "fields": [
      {
       "name": "text",
       "type": "text",
       "widget": "html",
       "tags": [
        "p",
        "br",
        "strong",
        "em",
        "code"
       ],
       "label": "Text",
       "importance": "high",
       "description": "Hint for the first part of the dialogue",
       "default": "<p style=\"text-align: center;\"></p>"
      },
      {
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
       "label": "Answer",
       "importance": "high",
       "description": "Hint for the second part of the dialogue",
       "default": "<p style=\"text-align: center;\"></p>"
      },
      {
       "name": "image",
       "type": "image",
       "label": "Image",
       "importance": "high",
       "optional": true,
       "description": "Optional image for the card. (The card may use just an image, just a text or both)"
      },
      {
       "name": "imageAltText",
       "type": "text",
       "label": "Alternative text for the image",
       "importance": "high",
       "optional": true
      },
      {
       "name": "audio",
       "type": "audio",
       "label": "Audio files",
       "importance": "low",
       "optional": true
      },
      {
       "name": "tips",
       "type": "group",
       "label": "Tips",
       "importance": "low",
       "fields": [
        {
         "name": "front",
         "type": "text",
         "label": "Tip for text",
         "importance": "low",
         "optional": true,
         "description": "Tip for the first part of the dialogue"
        },
        {
         "name": "back",
         "type": "text",
         "label": "Tip for answer",
         "importance": "low",
         "optional": true,
         "description": "Tip for the second part of the dialogue"
        }
       ]
      }
     ]
    }
   },
   {
    "name": "behaviour",
    "type": "group",
    "label": "Behavioural settings",
    "importance": "low",
    "description": "These options will let you control how the task behaves.",
    "optional": true,
    "fields": [
     {
      "name": "enableRetry",
      "type": "boolean",
      "label": "Enable \"Retry\" button",
      "importance": "low",
      "default": true,
      "optional": true
     },
     {
      "name": "disableBackwardsNavigation",
      "type": "boolean",
      "label": "Disable backwards navigation",
      "importance": "low",
      "description": "This option will only allow you to move forward with Dialog Cards",
      "optional": true,
      "default": false,
      "widget": "showWhen",
      "showWhen": {
       "rules": [
        {
         "field": "../mode",
         "equals": "normal"
        }
       ]
      }
     },
     {
      "name": "scaleTextNotCard",
      "type": "boolean",
      "label": "Scale the text to fit inside the card",
      "importance": "low",
      "description": "Unchecking this option will make the card adapt its size to the size of the text",
      "default": false
     },
     {
      "name": "randomCards",
      "type": "boolean",
      "label": "Randomize cards",
      "importance": "low",
      "description": "Enable to randomize the order of cards on display.",
      "default": false,
      "widget": "showWhen",
      "showWhen": {
       "rules": [
        {
         "field": "../mode",
         "equals": "normal"
        }
       ]
      }
     },
     {
      "name": "maxProficiency",
      "type": "number",
      "label": "Maximum proficiency level",
      "importance": "low",
      "default": 5,
      "min": 3,
      "max": 7,
      "optional": true,
      "widget": "showWhen",
      "showWhen": {
       "rules": [
        {
         "field": "../mode",
         "equals": "repetition"
        }
       ]
      }
     },
     {
      "name": "quickProgression",
      "type": "boolean",
      "label": "Allow quick progression",
      "description": "If activated, learners can decide to indicate that they know a card without turning it",
      "importance": "low",
      "default": false,
      "optional": true,
      "widget": "showWhen",
      "showWhen": {
       "rules": [
        {
         "field": "../mode",
         "equals": "repetition"
        }
       ]
      }
     }
    ]
   },
   {
    "label": "Text for the turn button",
    "importance": "low",
    "name": "answer",
    "type": "text",
    "default": "Turn",
    "common": true
   },
   {
    "label": "Text for the next button",
    "importance": "low",
    "type": "text",
    "name": "next",
    "default": "Next",
    "common": true
   },
   {
    "name": "prev",
    "type": "text",
    "label": "Text for the previous button",
    "importance": "low",
    "default": "Previous",
    "common": true
   },
   {
    "name": "retry",
    "type": "text",
    "label": "Text for the retry button",
    "importance": "low",
    "default": "Retry",
    "common": true
   },
   {
    "name": "correctAnswer",
    "type": "text",
    "label": "Text for the \"correct answer\" button",
    "importance": "low",
    "default": "I got it right!",
    "common": true
   },
   {
    "name": "incorrectAnswer",
    "type": "text",
    "label": "Text for the \"incorrect answer\" button",
    "importance": "low",
    "default": "I got it wrong",
    "common": true
   },
   {
    "name": "round",
    "type": "text",
    "label": "Text for \"Round\" message below cards and on the summary screen",
    "description": "@round will be replaced by the number of the current round",
    "importance": "low",
    "default": "Round @round",
    "common": true
   },
   {
    "name": "cardsLeft",
    "type": "text",
    "label": "Text for \"Cards left\" message",
    "description": "@number will be replaced by the number of cards left in this round",
    "importance": "low",
    "default": "Cards left: @number",
    "common": true
   },
   {
    "name": "nextRound",
    "type": "text",
    "label": "Text for the \"next round\" button",
    "description": "@round will be replaced by the round number",
    "importance": "low",
    "default": "Proceed to round @round",
    "common": true
   },
   {
    "name": "startOver",
    "type": "text",
    "label": "Text for the \"Start over\" button",
    "importance": "low",
    "default": "Start over",
    "common": true
   },
   {
    "name": "showSummary",
    "type": "text",
    "label": "Text for the \"show summary\" button",
    "importance": "low",
    "default": "Next",
    "common": true
   },
   {
    "name": "summary",
    "type": "text",
    "label": "Title text for the summary page",
    "importance": "low",
    "default": "Summary",
    "common": true
   },
   {
    "name": "summaryCardsRight",
    "type": "text",
    "label": "Text for \"Cards you got right:\"",
    "importance": "low",
    "default": "Cards you got right:",
    "common": true
   },
   {
    "name": "summaryCardsWrong",
    "type": "text",
    "label": "Text for \"Cards you got wrong:\"",
    "importance": "low",
    "default": "Cards you got wrong:",
    "common": true
   },
   {
    "name": "summaryCardsNotShown",
    "type": "text",
    "label": "Text for \"Cards not shown:\"",
    "importance": "low",
    "default": "Cards in pool not shown:",
    "common": true
   },
   {
    "name": "summaryOverallScore",
    "type": "text",
    "label": "Text for \"Overall Score\"",
    "importance": "low",
    "default": "Overall Score",
    "common": true
   },
   {
    "name": "summaryCardsCompleted",
    "type": "text",
    "label": "Text for \"Cards completed\"",
    "importance": "low",
    "default": "Cards you have completed learning:",
    "common": true
   },
   {
    "name": "summaryCompletedRounds",
    "type": "text",
    "label": "Text for \"Completed rounds:\"",
    "importance": "low",
    "default": "Completed rounds:",
    "common": true
   },
   {
    "name": "summaryAllDone",
    "type": "text",
    "label": "Message when all cards have been learned proficiently",
    "description": "@cards will be replaced by the number of all cards in the pool. @max will be replaced by the maximum proficiency level.",
    "importance": "low",
    "default": "Well done! You have mastered all @cards cards by getting them correct @max times!",
    "common": true
   },
   {
    "name": "progressText",
    "type": "text",
    "label": "Progress text",
    "importance": "low",
    "description": "Available variables are @card and @total.",
    "default": "Card @card of @total",
    "common": true
   },
   {
    "name": "cardFrontLabel",
    "type": "text",
    "label": "Label for card text",
    "importance": "low",
    "description": "Used for accessibility by assistive technologies",
    "default": "Card front",
    "common": true
   },
   {
    "name": "cardBackLabel",
    "type": "text",
    "label": "Label for card back",
    "importance": "low",
    "description": "Used for accessibility by assistive technologies",
    "default": "Card back",
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
    "name": "audioNotSupported",
    "type": "text",
    "label": "Audio not supported message",
    "importance": "low",
    "common": true,
    "default": "Your browser does not support this audio"
   },
   {
    "name": "confirmStartingOver",
    "type": "group",
    "label": "Confirm starting over dialog",
    "importance": "low",
    "common": true,
    "fields": [
     {
      "name": "header",
      "type": "text",
      "label": "Header text",
      "importance": "low",
      "default": "Start over?"
     },
     {
      "name": "body",
      "type": "text",
      "label": "Body text",
      "importance": "low",
      "default": "All progress will be lost. Are you sure you want to start over?",
      "widget": "html",
      "enterMode": "p",
      "tags": [
       "strong",
       "em",
       "del",
       "u",
       "code"
      ]
     },
     {
      "name": "cancelLabel",
      "type": "text",
      "label": "Cancel button label",
      "importance": "low",
      "default": "Cancel"
     },
     {
      "name": "confirmLabel",
      "type": "text",
      "label": "Confirm button label",
      "importance": "low",
      "default": "Start over"
     }
    ]
   }
  ],
  "deps": [
   "FontAwesome 4.5 preloaded",
   "H5P.JoubelUI 1.3 preloaded",
   "H5P.Audio 1.5 preloaded",
   "H5PEditor.VerticalTabs 1.3 editor",
   "H5PEditor.ShowWhen 1.0 editor"
  ]
 },
 "H5P.SortParagraphs": {
  "version": "0.11",
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
    "placeholder": "Describe what your students should do ...",
    "description": "What your students should know.",
    "type": "text",
    "widget": "html",
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
    ]
   },
   {
    "name": "paragraphs",
    "label": "Paragraphs",
    "type": "list",
    "entity": "paragraph",
    "min": 3,
    "field": {
     "name": "paragraph",
     "label": "Paragraph",
     "importance": "high",
     "type": "text",
     "widget": "html",
     "enterMode": "div",
     "tags": [
      "strong",
      "em",
      "u",
      "ul",
      "ol",
      "h2",
      "h3",
      "hr",
      "pre",
      "code"
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
    "description": "These options will let you control how the task behaves.",
    "fields": [
     {
      "name": "scoringMode",
      "label": "Scoring mode",
      "description": "Decide whether to give points for each correctly placed paragraph or for each paragraph that is placed after the paragraph it is supposed to be placed after (\"correct sequence\")",
      "type": "select",
      "importance": "low",
      "default": "positions",
      "options": [
       {
        "value": "positions",
        "label": "Correctly placed paragraph"
       },
       {
        "value": "transitions",
        "label": "Correct sequence"
       }
      ]
     },
     {
      "name": "applyPenalties",
      "label": "Apply penalties",
      "description": "Decide whether to deduce a point for each paragraph that's not positioned correctly.",
      "type": "boolean",
      "importance": "low",
      "default": true,
      "widget": "showWhen",
      "showWhen": {
       "rules": [
        {
         "field": "scoringMode",
         "equals": "positions"
        }
       ]
      }
     },
     {
      "name": "duplicatesInterchangeable",
      "label": "Duplicate parapraphs interchangeable",
      "description": "If set, when checking the answer, duplicate paragraphs will be treated as identical if their plain text is equal.",
      "type": "boolean",
      "importance": "low",
      "default": true,
      "optional": true
     },
     {
      "name": "addButtonsForMovement",
      "label": "Add buttons for movement",
      "description": "On mobile devices, buttons for moving paragraphs can offer an extra accessibility benefit. If you prefer, you can deactivate them here.",
      "type": "boolean",
      "importance": "low",
      "default": true,
      "optional": true
     },
     {
      "name": "enableRetry",
      "label": "Enable \"Retry\" button",
      "type": "boolean",
      "importance": "low",
      "default": true,
      "optional": true
     },
     {
      "name": "enableSolutionsButton",
      "label": "Enable \"Show Solution\" button",
      "type": "boolean",
      "importance": "low",
      "default": true,
      "optional": true
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
      "name": "up",
      "type": "text",
      "label": "Title for \"Up\" button",
      "importance": "low",
      "default": "Up"
     },
     {
      "name": "down",
      "type": "text",
      "label": "Title for \"Down\" button",
      "importance": "low",
      "default": "Down"
     },
     {
      "name": "disabled",
      "type": "text",
      "label": "Title for button that is disabled",
      "importance": "low",
      "default": "Disabled"
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
      "name": "check",
      "type": "text",
      "label": "Assistive technology description for \"Check\" button",
      "importance": "low",
      "default": "Check the answers. The responses will be marked as correct or incorrect."
     },
     {
      "name": "showSolution",
      "type": "text",
      "label": "Assistive technology description for \"Show Solution\" button",
      "importance": "low",
      "default": "Show the solution. The correct solution will be displayed."
     },
     {
      "name": "retry",
      "type": "text",
      "label": "Assistive technology description for \"Retry\" button",
      "importance": "low",
      "default": "Retry the task. Reset all elements and start the task over again."
     },
     {
      "name": "yourResult",
      "type": "text",
      "label": "Your result",
      "description": "@score will be replaced by the number of points. @total will be replaced by the maximum possible points.",
      "importance": "low",
      "default": "You got @score out of @total points"
     },
     {
      "name": "listDescription",
      "type": "text",
      "label": "List description",
      "importance": "low",
      "default": "Sortable list of paragraphs."
     },
     {
      "name": "listDescriptionCheckAnswer",
      "type": "text",
      "label": "List description (check answer)",
      "importance": "low",
      "default": "List of paragraphs with results."
     },
     {
      "name": "listDescriptionShowSolution",
      "type": "text",
      "label": "List description (show solution)",
      "importance": "low",
      "default": "List of paragraphs with solutions."
     },
     {
      "name": "paragraph",
      "type": "text",
      "label": "Paragraph",
      "importance": "low",
      "default": "Paragraph"
     },
     {
      "name": "correct",
      "type": "text",
      "label": "Correct",
      "importance": "low",
      "default": "correct"
     },
     {
      "name": "wrong",
      "type": "text",
      "label": "Wrong",
      "importance": "low",
      "default": "wrong"
     },
     {
      "name": "point",
      "description": "@score will be replaced by 1 or -1.",
      "type": "text",
      "label": "Score explanation",
      "importance": "low",
      "default": "@score point"
     },
     {
      "name": "sevenOfNine",
      "description": "@current will be replaced by the current paragraph number. @total will be replaced by the number of paragraphs.",
      "type": "text",
      "label": "Paragraph numbering",
      "importance": "low",
      "default": "@current of @total"
     },
     {
      "name": "currentPosition",
      "description": "Will be followed by \"Paragraph numbering\".",
      "type": "text",
      "label": "Current position in list",
      "importance": "low",
      "default": "Current position in list"
     },
     {
      "name": "instructionsSelected",
      "type": "text",
      "label": "Instruction when paragraph selected",
      "importance": "low",
      "default": "Press spacebar to reorder"
     },
     {
      "name": "instructionsGrabbed",
      "type": "text",
      "label": "Instruction when paragraph grabbed",
      "importance": "low",
      "default": "Press up and down arrow keys to change position, spacebar to drop, escape to cancel"
     },
     {
      "name": "grabbed",
      "type": "text",
      "label": "Grabbed",
      "importance": "low",
      "default": "Grabbed"
     },
     {
      "name": "moved",
      "type": "text",
      "label": "Moved",
      "importance": "low",
      "default": "Moved"
     },
     {
      "name": "dropped",
      "type": "text",
      "label": "Dropped",
      "importance": "low",
      "default": "Dropped"
     },
     {
      "name": "reorderCancelled",
      "type": "text",
      "label": "Reorder cancelled",
      "importance": "low",
      "default": "Reorder cancelled"
     },
     {
      "name": "finalPosition",
      "description": "Will be followed by \"Paragraph numbering\".",
      "type": "text",
      "label": "Final position",
      "importance": "low",
      "default": "Final position"
     },
     {
      "name": "nextParagraph",
      "description": "Will be followed by \"correct\" or \"wrong\".",
      "type": "text",
      "label": "Next paragraph",
      "importance": "low",
      "default": "Next paragraph"
     },
     {
      "name": "correctParagraph",
      "description": "Will be followed by \"Paragraph numbering\".",
      "type": "text",
      "label": "Correct Paragraph",
      "importance": "low",
      "default": "Correct paragraph at position"
     }
    ]
   }
  ],
  "deps": [
   "FontAwesome 4.5 preloaded",
   "H5P.Question 1.5 preloaded",
   "H5P.JoubelUI 1.3 preloaded",
   "H5PEditor.RangeList 1.0 editor",
   "H5PEditor.ShowWhen 1.0 editor"
  ]
 },
 "H5P.AdvancedText": {
  "version": "1.1",
  "semantics": [
   {
    "name": "text",
    "type": "text",
    "widget": "html",
    "label": "Text",
    "importance": "high",
    "enterMode": "p",
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
    ],
    "font": {
     "size": true,
     "color": true,
     "background": true
    }
   }
  ],
  "deps": []
 }
};
