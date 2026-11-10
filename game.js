// =====================================================
// MENTALS
// Two games against the computer:
//   Times Rally - take turns multiplying: 7 × 1, 7 × 2, 7 × 3 ...
//   Quick Sums  - answer random adding / taking-away / dividing questions
//                 (adding and taking away can use negative numbers)
// While playing you can Pause (or press Esc) and End the game.
// =====================================================


// ----- Settings (change these to make the game easier or harder) -----
// seconds    = time for each answer at the start
// min / max  = Quick Sums number sizes (adding and taking away)
// divideBy   = Dividing: the smallest and biggest number to divide by
// answers    = Dividing: the smallest and biggest answer
// cheerAbove = scores ABOVE this get a spoken "Congratulations!"
var LEVELS = {
  easy:   { seconds: 10, min: 1,  max: 10,  divideBy: [2, 5],  answers: [1, 10], cheerAbove: 20 },
  medium: { seconds: 8,  min: 10, max: 50,  divideBy: [2, 10], answers: [2, 12], cheerAbove: 15 },
  hard:   { seconds: 6,  min: 50, max: 200, divideBy: [3, 12], answers: [5, 20], cheerAbove: 10 }
};

var FASTEST_SECONDS = 3;      // the timer never gets shorter than this
var SPEED_UP_EVERY = 5;       // every 5 correct answers: 0.5s less time (and bigger sums)
var VOICE_EXTRA_SECONDS = 3;  // extra time when answering out loud
var PC_PAUSE = 700;           // how long the computer "thinks" (milliseconds)
var LARGEST_NUMBER = 1000;    // biggest number allowed in Times Rally
var NEGATIVE_CHANCE = 0.4;    // with negatives on: how often each number is negative (0.4 = 40%)


// ----- Game state -----
var mode = "rally";     // "rally" or "sums"
var table = 2;          // Times Rally: the number being multiplied
var op = "add";         // Quick Sums: "add", "sub", "div" or "mix"
var level = "easy";     // "easy", "medium" or "hard"

var score = 0;
var step = 0;           // Times Rally: how far along (table × step)
var expected = 0;       // the right answer for this turn
var question = "";      // e.g. "7 × 4" or "12 + 7"
var pcSaid = "";        // what the computer just said (so the mic can ignore it)
var negatives = true;   // Quick Sums: use negative numbers in adding and taking away
var turnTimer = null;
var voiceOn = false;

var gameRunning = false;
var paused = false;
var turnEndsAt = 0;     // when the answer timer runs out (milliseconds)
var timeLeft = 0;       // time that was left on the timer when paused
var waitingMove = null; // the computer's move, if it was due while paused
var lastSpeech = "";    // what the computer last said (said again after a pause)
var gameNumber = 0;     // goes up each new game, so moves from an old game are ignored


// ----- Parts of the page -----
var tableInput = document.querySelector("#tableInput");
var voiceToggle = document.querySelector("#voiceToggle");
var negToggle = document.querySelector("#negToggle");
var answerBox = document.querySelector("#answer");
var pcBubble = document.querySelector("#pcBubble");
var youBubble = document.querySelector("#youBubble");
var pcCaption = document.querySelector("#pcCaption");
var youCaption = document.querySelector("#youCaption");
var turnText = document.querySelector("#turnText");
var voiceStatus = document.querySelector("#voiceStatus");
var timerBar = document.querySelector("#timerBar");
var rallyLog = document.querySelector("#rallyLog");
var music = document.querySelector("#bgMusic");


// =====================================================
// SCREENS AND TURNS
// (styles.css does the showing/hiding; JS only sets the labels)
// =====================================================
function showScreen(name) {
  document.body.dataset.screen = name; // "start", "play" or "over"
}

function setTurn(who) {
  document.body.dataset.turn = who; // "pc", "you", "wrong" or ""

  // the answer box can only be typed in on your turn
  answerBox.readOnly = who !== "you";
}

// your turn, and the game isn't paused
function isYourTurn() {
  return document.body.dataset.turn === "you" && !paused;
}


// =====================================================
// READING THE CHOICES ON THE START SCREEN
// =====================================================
function checkedValue(name) {
  return document.querySelector("input[name='" + name + "']:checked").value;
}

function readChoices() {
  mode = checkedValue("mode");
  op = checkedValue("op");
  level = checkedValue("level");
  table = Number(tableInput.value);
  negatives = negToggle.checked;
}

// can this game have negative numbers? (Quick Sums, not dividing only)
function usesNegatives() {
  return mode === "sums" && negatives && op !== "div";
}

// e.g. "×7 · Easy" or "Adding · Easy"
function gameLabel() {
  var levelNames = { easy: "Easy", medium: "Medium", hard: "Hard" };

  if (mode === "rally") {
    return "×" + table + " · " + levelNames[level];
  }

  var opNames = { add: "Adding", sub: "Taking away", div: "Dividing", mix: "Mixed" };
  var withNegatives = usesNegatives() ? " (with −)" : "";
  return opNames[op] + withNegatives + " · " + levelNames[level];
}

function updateLabels() {
  readChoices();
  document.querySelector("#startError").textContent = ""; // clear any old message
  document.querySelectorAll(".game-label").forEach(function (place) {
    place.textContent = gameLabel();
  });
  document.querySelector("#bestStart").textContent = getBest();
  document.querySelector("#levelHint").textContent =
    LEVELS[level].seconds + " seconds for each answer. Score over " +
    LEVELS[level].cheerAbove + " for a big cheer! 🎉";
}


// =====================================================
// START
// =====================================================
function startGame() {
  readChoices();

  // Times Rally needs a whole number from 1 to 1000
  var error = "";
  if (mode === "rally" && !(Number.isInteger(table) && table >= 1 && table <= LARGEST_NUMBER)) {
    error = "Please type a whole number from 1 to " + LARGEST_NUMBER + " (like 7 or 12).";
  }
  document.querySelector("#startError").textContent = error;
  if (error) {
    return;
  }

  score = 0;
  step = 0;
  document.querySelector("#score").textContent = 0;
  document.body.dataset.superstar = "no";
  setBubble(pcBubble, "–", false);
  setBubble(youBubble, "?", false);
  pcCaption.textContent = "";
  youCaption.textContent = "";
  rallyLog.innerHTML = "";
  updateLabels();

  voiceOn = voiceToggle.checked && voiceSupported;
  document.body.dataset.voice = voiceOn ? "on" : "off";

  // the − key on the number pad only shows when answers can be negative
  document.body.dataset.negatives = usesNegatives() ? "yes" : "no";

  gameNumber++;
  gameRunning = true;
  paused = false;
  waitingMove = null;
  document.body.dataset.paused = "no";

  showScreen("play");
  playMusic();
  startMic();      // the microphone stays on for the whole game
  computerTurn();
}


// =====================================================
// COMPUTER'S TURN
// =====================================================
function computerTurn() {
  setTurn("pc");
  answerBox.value = "";
  stopAcceptingVoice();
  turnText.textContent = "Computer's turn… 🤔";
  setBubble(youBubble, "?", false);
  youCaption.textContent = "";

  var thisGame = gameNumber;
  setTimeout(function () {
    if (thisGame === gameNumber) {
      computerMove();
    }
  }, PC_PAUSE);
}

function computerMove() {
  // stop if the game ended while the computer was "thinking"
  if (!gameRunning) {
    return;
  }

  // paused while the computer was "thinking": make the move after Keep Playing
  if (paused) {
    waitingMove = computerMove;
    return;
  }

  var speech = "";

  if (mode === "rally") {
    // the computer answers the next multiplication
    step++;
    var pcAnswer = table * step;
    setBubble(pcBubble, pcAnswer, true);
    pcCaption.textContent = table + " × " + step;
    addToLog(table + " × " + step + " = " + pcAnswer, "chip-pc");
    speech = String(pcAnswer); // only the answer is said; "7 × 3" is shown on screen
    pcSaid = String(pcAnswer);

    // now it's the player's multiplication
    question = table + " × " + (step + 1);
    expected = table * (step + 1);
    youCaption.textContent = question;
  } else {
    // the computer asks a new sum
    speech = makeSum();
    setBubble(pcBubble, question, true);
    pcCaption.textContent = "Question";
    youCaption.textContent = "Answer";
    pcSaid = "";
  }

  playerTurn("What is " + question + "?");
  lastSpeech = speech;
  say(speech, startAcceptingVoice);
}

// Quick Sums: make a random question (it gets bigger as the score goes up).
// Returns the words the computer says, e.g. "12 plus 7".
function makeSum() {
  var range = LEVELS[level];
  var grow = 1 + Math.floor(score / SPEED_UP_EVERY) * 0.25;
  var max = Math.round(range.max * grow);

  var a = randomBetween(range.min, max);
  var b = randomBetween(range.min, max);

  // Mix: pick adding, taking away or dividing at random
  var thisOp = op;
  if (op === "mix") {
    thisOp = ["add", "sub", "div"][randomBetween(0, 2)];
  }

  if (thisOp === "div") {
    return makeDivision(grow);
  }

  // negative numbers on: sometimes make a number negative
  if (negatives) {
    if (Math.random() < NEGATIVE_CHANCE) {
      a = -a;
    }
    if (Math.random() < NEGATIVE_CHANCE) {
      b = -b;
    }
  }

  // shown as e.g. "−7 + (−3)", said as "negative 7 plus negative 3"
  if (thisOp === "add") {
    expected = a + b;
    question = showNumber(a) + " + " + showSecond(b);
    return sayNumber(a) + " plus " + sayNumber(b);
  }

  // taking away with negatives OFF: bigger number first,
  // so the answer is never below zero
  if (!negatives && b > a) {
    var swap = a;
    a = b;
    b = swap;
  }
  expected = a - b;
  question = showNumber(a) + " − " + showSecond(b);
  return sayNumber(a) + " minus " + sayNumber(b);
}

// -5 is shown with a proper minus sign: "−5"
function showNumber(n) {
  return n < 0 ? "−" + (-n) : String(n);
}

// a negative SECOND number gets brackets: 4 − (−2)
function showSecond(n) {
  return n < 0 ? "(" + showNumber(n) + ")" : String(n);
}

// -5 is said as "negative 5"
function sayNumber(n) {
  return n < 0 ? "negative " + (-n) : String(n);
}

// Dividing: the answer is chosen FIRST, so it is always a whole number.
// e.g. answer 4, divide by 6  ->  the question is 24 ÷ 6
function makeDivision(grow) {
  var range = LEVELS[level];
  var divideBy = randomBetween(range.divideBy[0], range.divideBy[1]);
  var answer = randomBetween(range.answers[0], Math.round(range.answers[1] * grow));
  var bigNumber = answer * divideBy;

  expected = answer;
  question = bigNumber + " ÷ " + divideBy;
  return bigNumber + " divided by " + divideBy;
}


// =====================================================
// PLAYER'S TURN
// =====================================================
function playerTurn(prompt) {
  setTurn("you");
  turnText.textContent = "Your turn! " + prompt;
  answerBox.value = "";
  if (!voiceOn) {
    answerBox.focus();
  }
  startTimer();
}

function checkAnswer() {
  if (!isYourTurn()) {
    return;
  }

  // a whole number, maybe with a minus in front: "12" or "-12"
  var typed = answerBox.value.trim();
  if (!/^-?\d+$/.test(typed)) {
    return;
  }

  stopTimer();
  stopAcceptingVoice();

  var number = Number(typed);
  setBubble(youBubble, showNumber(number), true);

  if (number === expected) {
    // Correct!
    score++;
    if (mode === "rally") {
      step++;
    }
    document.querySelector("#score").textContent = score;
    addToLog(question + " = " + showNumber(number), "chip-you");
    showStar();
    beep(880, 0.15);

    // high score reached: show the "Superstar zone" message
    if (score > LEVELS[level].cheerAbove) {
      document.body.dataset.superstar = "yes";
    }

    computerTurn();
  } else {
    // Wrong
    addToLog(question + " = " + showNumber(number), "chip-wrong");
    gameOver("You said <b>" + showNumber(number) + "</b>, but " + rightAnswer() + ".");
  }
}

// e.g. "7 × 4 = 28"  or  "−7 + 3 = −4"
function rightAnswer() {
  return "<b>" + question + " = " + showNumber(expected) + "</b>";
}


// =====================================================
// TIMER
// The bar's shrinking is a CSS animation (.timer-bar.running in styles.css)
// =====================================================
function startTimer() {
  // get faster as the score goes up
  var seconds = LEVELS[level].seconds - Math.floor(score / SPEED_UP_EVERY) * 0.5;
  seconds = Math.max(seconds, FASTEST_SECONDS);

  if (voiceOn) {
    seconds = seconds + VOICE_EXTRA_SECONDS;
  }

  document.documentElement.style.setProperty("--turn-time", seconds + "s");

  // restart the CSS animation
  timerBar.classList.remove("running");
  void timerBar.offsetWidth;
  timerBar.classList.add("running");

  runTimer(seconds * 1000);
}

// game over when the time runs out (also used to carry on after a pause)
function runTimer(milliseconds) {
  clearTimeout(turnTimer);
  turnEndsAt = Date.now() + milliseconds;
  turnTimer = setTimeout(function () {
    gameOver("Time's up! ⏰ " + rightAnswer() + ".");
  }, milliseconds);
}

function stopTimer() {
  clearTimeout(turnTimer);
  timerBar.classList.remove("running");
}


// =====================================================
// PAUSE AND END GAME
// The cover over the game and the stopped timer bar are done
// in styles.css (data-paused on <body>).
// =====================================================
function pauseGame() {
  var turn = document.body.dataset.turn;
  if (!gameRunning || paused || (turn !== "pc" && turn !== "you")) {
    return; // nothing to pause (or the game is already ending)
  }

  paused = true;
  document.body.dataset.paused = "yes";

  // stop the clock, remembering how much time was left
  if (turn === "you") {
    clearTimeout(turnTimer);
    timeLeft = turnEndsAt - Date.now();
  }

  answerBox.readOnly = true;
  stopAcceptingVoice();
  if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
  }
  music.pause();

  document.querySelector("#resumeBtn").focus();
}

function resumeGame() {
  if (!paused) {
    return;
  }

  paused = false;
  document.body.dataset.paused = "no";
  playMusic();

  // the computer's move was due while paused: make it now
  if (waitingMove) {
    var move = waitingMove;
    waitingMove = null;
    move();
    return;
  }

  if (document.body.dataset.turn === "you") {
    answerBox.readOnly = false;
    runTimer(Math.max(timeLeft, 1000)); // carry on with the time that was left
    if (!voiceOn) {
      answerBox.focus();
    }
    // say the question again, then listen
    say(lastSpeech, startAcceptingVoice);
  }
}

function togglePause() {
  if (paused) {
    resumeGame();
  } else {
    pauseGame();
  }
}

function endGame() {
  if (!gameRunning) {
    return;
  }
  paused = false;
  waitingMove = null;
  document.body.dataset.paused = "no";
  if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
  }
  playMusic(); // in case it was paused
  gameOver("You ended the game. 👋", true);
}


// =====================================================
// GAME OVER
// =====================================================
// endedByPlayer = true when the End game button was pressed
function gameOver(reason, endedByPlayer) {
  gameRunning = false;
  stopTimer();
  stopMic();
  setTurn(endedByPlayer ? "ended" : "wrong");
  if (endedByPlayer) {
    turnText.textContent = "Game ended.";
  } else {
    turnText.textContent = "Oh no! 😮";
    beep(160, 0.5);
  }

  var isNewBest = saveBest(score);
  var bigScore = score > LEVELS[level].cheerAbove;
  var overScreen = document.querySelector("#overScreen");

  overScreen.classList.toggle("got-best", isNewBest);
  overScreen.classList.toggle("cheer", bigScore);

  document.querySelector("#overTitle").textContent = bigScore ? "🎉 Congratulations! 🎉" : "Game Over!";
  document.querySelector("#overReason").innerHTML = reason;
  document.querySelector("#finalScore").textContent = score;
  document.querySelector("#bestOver").textContent = getBest();

  // short pause so the player sees what happened (shorter if they pressed End game)
  setTimeout(function () {
    setTurn("");
    showScreen("over");

    // big scores get a spoken congratulation and confetti
    if (bigScore) {
      say("Congratulations! You scored " + score + "! You are a maths superstar!");
      throwConfetti();
    }
  }, endedByPlayer ? 300 : 1200);
}


// =====================================================
// TALKING ANSWERS (Chrome and Edge)
//
// The microphone is switched on ONCE when the game starts and stays on
// until game over, so the browser only asks for permission once.
// While the computer is talking, anything heard is ignored.
// =====================================================
var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
var voiceSupported = Boolean(SpeechRecognition);
var listener = null;
var micWanted = false;    // should the microphone be on?
var micRunning = false;   // is it on right now?
var acceptAfter = 0;      // spoken answers only count after this time
var misheard = "";        // last thing heard that wasn't a number

if (!voiceSupported) {
  // styles.css shows the "needs Chrome or Edge" note
  document.body.dataset.voiceSupport = "no";
} else {
  listener = new SpeechRecognition();
  listener.lang = "en-US";
  listener.continuous = true;      // keep listening: no new permission request each answer
  listener.interimResults = false;
  listener.maxAlternatives = 5;

  listener.onstart = function () {
    micRunning = true;
  };

  listener.onresult = function (event) {
    for (var i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        useWhatWasHeard(event.results[i]);
      }
    }
  };

  // Chrome sometimes stops listening by itself (long silence): switch it back on
  listener.onend = function () {
    micRunning = false;
    if (micWanted) {
      setTimeout(startMic, 300);
    }
  };

  listener.onerror = function (event) {
    var blocked = ["not-allowed", "service-not-allowed", "audio-capture"];

    if (blocked.indexOf(event.error) !== -1) {
      // no microphone permission: carry on with typing
      micWanted = false;
      voiceOn = false;
      document.body.dataset.voice = "off";
      document.body.dataset.listening = "no";
      turnText.textContent = "Microphone blocked. Type your answer instead.";
      answerBox.focus();
    }
  };
}

function startMic() {
  if (!voiceOn) {
    return;
  }
  micWanted = true;
  if (!micRunning) {
    try {
      listener.start();
    } catch (error) {
      // already on
    }
  }
}

function stopMic() {
  micWanted = false;
  stopAcceptingVoice();
  if (listener && micRunning) {
    listener.abort();
  }
}

// called when the computer has finished talking
function startAcceptingVoice() {
  if (!voiceOn || !isYourTurn()) {
    return;
  }
  // a short gap, so the end of the computer's own voice isn't taken as your answer
  acceptAfter = Date.now() + 600;
  misheard = "";

  setTimeout(function () {
    if (isYourTurn()) {
      document.body.dataset.listening = "yes";
      voiceStatus.textContent = "🎤 Listening… say your answer!";
    }
  }, 600);
}

function stopAcceptingVoice() {
  acceptAfter = Infinity;
  document.body.dataset.listening = "no";
  voiceStatus.textContent = "🎤 Wait for the computer…";
}

// the numbers in something said, or null if it sounds like the question itself
function answerNumbersIn(text) {
  // skip the computer's own words (e.g. the sum question "12 plus 7" or "24 divided by 6").
  // "minus" on its own is allowed: "minus five" is the answer −5
  if (/plus|times|divided|\+|×|÷|\*|\bx\b|\/|\d\s*[-−]\s*\d/i.test(text)) {
    return null;
  }
  var found = numbersIn(text);
  if (found.isSum) {
    return null; // "12 minus 5" is the question, not an answer
  }
  return found.filter(function (n) {
    return String(n) !== pcSaid; // ignore the number the computer just said
  });
}

function useWhatWasHeard(result) {
  // not your turn yet, or the computer is still talking: ignore
  if (!isYourTurn() || Date.now() < acceptAfter) {
    return;
  }

  // The browser sends several guesses of what it heard (best guess first).
  // Collect every number from every guess.
  var firstGuessNumber = null;
  var rightAnswerHeard = false;

  for (var i = 0; i < result.length; i++) {
    var numbers = answerNumbersIn(result[i].transcript);
    if (numbers === null) {
      continue;
    }

    // 1. If ANY guess contains the right answer, use it
    //    (the browser often puts the right number 2nd or 3rd)
    if (numbers.indexOf(expected) !== -1) {
      rightAnswerHeard = true;
      break;
    }

    // 2. Otherwise remember the LAST number in the best guess
    //    ("I think it is eight" -> 8)
    if (firstGuessNumber === null && numbers.length > 0) {
      firstGuessNumber = numbers[numbers.length - 1];
    }
  }

  var heard = rightAnswerHeard ? expected : firstGuessNumber;

  if (heard === null) {
    misheard = result[0].transcript.trim();
    voiceStatus.textContent = "🎤 Heard \"" + misheard + "\". Say just the number!";
    return;
  }

  voiceStatus.textContent = "🎤 Heard: " + showNumber(heard);
  answerBox.value = heard;
  checkAnswer();
}


// ----- Reading numbers out of what was said -----

// real number words
var UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19
};

var TENS = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

// words that SOUND like numbers. They only count when nothing else
// in the sentence is a number ("for" alone = 4, but "I want to say eight" = 8)
var SOUND_ALIKES = {
  won: 1, to: 2, too: 2, tu: 2, tree: 3, free: 3, for: 4, fore: 4, foe: 4,
  fiv: 5, sicks: 6, sticks: 6, ate: 8, aight: 8, nein: 9, tin: 10
};

// Finds all the numbers in a sentence, in order:
// "four eight" -> [4, 8, 48]   "twenty four" -> [24]   "I want to say eight" -> [8]
// "minus five" or "negative five" -> [-5]
// If it sounds like a question ("12 minus 5"), the list gets isSum = true.
function numbersIn(text) {
  var cleaned = text.toLowerCase()
    .replace(/,/g, "")
    .replace(/[−–]/g, "-")
    .replace(/(^|\s)-(?=\d)/g, "$1minus ")  // "-5" -> "minus 5"
    .replace(/-/g, " ");                     // "twenty-four" -> "twenty four"
  var words = cleaned.match(/\d+|[a-z']+/g) || [];

  var hasRealNumber = words.some(function (w) {
    return /^\d+$/.test(w) || UNITS[w] !== undefined || TENS[w] !== undefined;
  });

  var numbers = [];
  var singleDigits = [];   // for "four eight" said digit by digit -> 48
  var total = 0;
  var current = 0;
  var last = "";           // what kind of word came last: "", "unit", "teen", "ten", "big"
  var building = false;
  var sign = 1;            // -1 after "minus" or "negative"
  var afterNumber = false; // was the last word part of a number?
  var isSum = false;

  function finishNumber() {
    if (building) {
      numbers.push(sign * (total + current));
      sign = 1;
    }
    total = 0;
    current = 0;
    last = "";
    building = false;
  }

  words.forEach(function (w) {
    var value = null;
    var kind = "";

    if (w === "minus" || w === "negative") {
      // straight after a number it's taking away ("12 minus 5" = a question),
      // otherwise the next number is negative ("minus 5" = -5)
      if (afterNumber && w === "minus") {
        isSum = true;
      }
      finishNumber();
      sign = -1;
      afterNumber = false;
      singleDigits.push("|-");
      return;
    }

    afterNumber = true;

    if (/^\d+$/.test(w)) {
      // digits like "48": a complete number on its own
      finishNumber();
      numbers.push(sign * Number(w));
      sign = 1;
      singleDigits.push(w.length === 1 ? w : "|");
      return;
    } else if (UNITS[w] !== undefined) {
      value = UNITS[w];
      kind = value < 10 ? "unit" : "teen";
    } else if (TENS[w] !== undefined) {
      value = TENS[w];
      kind = "ten";
    } else if (!hasRealNumber && SOUND_ALIKES[w] !== undefined) {
      value = SOUND_ALIKES[w];
      kind = value < 10 ? "unit" : "teen";
    } else if ((w === "hundred" || w === "thousand") && building) {
      if (w === "hundred") {
        current = current * 100;
      } else {
        total = (total + current) * 1000;
        current = 0;
      }
      last = "big";
      singleDigits.push("|");
      return;
    } else if (w === "and" && building) {
      return; // "one hundred AND five"
    } else {
      // any other word ends the number being built
      finishNumber();
      afterNumber = false;
      singleDigits.push("|");
      return;
    }

    // can this word join the number being built?
    // yes: "twenty" + "four", "hundred" + anything. no: "four" + "eight"
    var joins = building && (last === "big" || (last === "ten" && kind === "unit" && value > 0));
    if (!joins) {
      finishNumber();
    }

    current += value;
    last = kind;
    building = true;
    // a lone digit word ("four") can be part of digits said one by one;
    // a word joining a bigger number ("twenty FOUR") can't
    singleDigits.push(kind === "unit" && !joins ? String(value) : "|");
  });

  finishNumber();

  // digits said one by one ("four eight" -> 48, "minus four eight" -> -48)
  // are also a possible answer
  singleDigits.join("").split("|").forEach(function (run) {
    if (/^-?\d{2,}$/.test(run)) {
      numbers.push(Number(run));
    }
  });

  numbers.isSum = isSum;
  return numbers;
}


// =====================================================
// BEST SCORES (saved in this browser, one per game setting)
// =====================================================
function bestKey() {
  if (mode === "rally") {
    return "rally-" + table + "-" + level;
  }
  // games with negative numbers keep their own best score
  return "sums-" + op + (usesNegatives() ? "-neg" : "") + "-" + level;
}

function getAllBest() {
  try {
    return JSON.parse(localStorage.getItem("mentalsBest")) || {};
  } catch (error) {
    return {};
  }
}

function getBest() {
  return getAllBest()[bestKey()] || 0;
}

// returns true if this is a new best
function saveBest(newScore) {
  var all = getAllBest();
  if (newScore <= (all[bestKey()] || 0)) {
    return false;
  }

  all[bestKey()] = newScore;
  try {
    localStorage.setItem("mentalsBest", JSON.stringify(all));
  } catch (error) {
    // storage not available (private window): best score just isn't kept
  }
  return true;
}


// =====================================================
// SMALL HELPERS
// =====================================================
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// show text in a bubble; long text gets a smaller font (.bubble.long in styles.css)
function setBubble(bubble, text, pop) {
  text = String(text);
  bubble.textContent = text;
  bubble.classList.toggle("long", text.length > 5);

  if (pop) {
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
  }
}

// "+1 ⭐" floats up from your side (.you.scored in styles.css)
function showStar() {
  var you = document.querySelector(".player.you");
  you.classList.remove("scored");
  void you.offsetWidth;
  you.classList.add("scored");
}

// add an answer to the list at the bottom (keeps the last 8)
function addToLog(text, chipClass) {
  var chip = document.createElement("span");
  chip.className = "chip " + chipClass;
  chip.textContent = text;
  rallyLog.appendChild(chip);

  while (rallyLog.children.length > 8) {
    rallyLog.removeChild(rallyLog.firstChild);
  }
}

// confetti for big scores (the falling is a CSS animation: .piece)
function throwConfetti() {
  var box = document.querySelector("#confetti");
  var colours = ["#f2b134", "#e85d75", "#2a9d8f", "#fff6ea", "#e07a3f", "#a8c69f", "#c9a7d8"];
  box.innerHTML = "";

  for (var i = 0; i < 80; i++) {
    var piece = document.createElement("span");
    piece.className = "piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.backgroundColor = colours[i % colours.length];
    piece.style.animationDelay = Math.random() * 1.5 + "s";
    piece.style.animationDuration = 2.5 + Math.random() * 2 + "s";
    box.appendChild(piece);
  }

  // tidy up afterwards
  setTimeout(function () {
    box.innerHTML = "";
  }, 6000);
}

// the computer speaks; "done" runs when it has finished talking
function say(text, done) {
  var finished = false;

  function finish() {
    if (!finished) {
      finished = true;
      if (done) {
        done();
      }
    }
  }

  if (!("speechSynthesis" in window)) {
    finish();
    return;
  }

  speechSynthesis.cancel();
  var words = new SpeechSynthesisUtterance(text);
  words.rate = 1.05;
  words.pitch = 1.2;
  words.onend = finish;
  words.onerror = finish;
  speechSynthesis.speak(words);

  // backup, in case the browser never says it has finished
  setTimeout(finish, 4000);
}

// short sound effects (made in the browser, no sound files needed)
var audioCtx = null;

function beep(frequency, seconds) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    var tone = audioCtx.createOscillator();
    var volume = audioCtx.createGain();

    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.2, audioCtx.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + seconds);

    tone.connect(volume);
    volume.connect(audioCtx.destination);
    tone.start();
    tone.stop(audioCtx.currentTime + seconds);
  } catch (error) {
    // no sound effects on this browser
  }
}


// =====================================================
// BACKGROUND MUSIC (the file is chosen in index.html)
// =====================================================
music.volume = 0.25; // 0 = silent, 1 = full volume

function playMusic() {
  if (music.paused) {
    music.play().catch(function () {
      console.log("No background music yet. Put your song at sounds/background-music.mp3");
    });
  }
}


// =====================================================
// BUTTONS AND KEYS
// =====================================================
document.querySelector("#startBtn").addEventListener("click", startGame);
document.querySelector("#againBtn").addEventListener("click", startGame);

document.querySelector("#changeBtn").addEventListener("click", function () {
  showScreen("start");
});

// Pause, Keep Playing and End game
document.querySelector("#pauseBtn").addEventListener("click", pauseGame);
document.querySelector("#resumeBtn").addEventListener("click", resumeGame);
document.querySelectorAll(".end-btn").forEach(function (button) {
  button.addEventListener("click", endGame);
});

// switching to another tab or app pauses the game
document.addEventListener("visibilitychange", function () {
  if (document.hidden) {
    pauseGame();
  }
});

// any change on the start screen updates the labels and best score
document.querySelectorAll(".start-screen input").forEach(function (input) {
  input.addEventListener("change", updateLabels);
});

// whole numbers only in the "which number" box
tableInput.addEventListener("input", function () {
  tableInput.value = tableInput.value.replace(/\D/g, "");
  updateLabels();
});

// Enter in the number box starts the game
tableInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    startGame();
  }
});

// quick-pick buttons fill in the number box
document.querySelectorAll(".quick").forEach(function (button) {
  button.addEventListener("click", function () {
    tableInput.value = button.dataset.number;
    updateLabels();
  });
});

// typing + Enter (computers)
document.querySelector("#answerForm").addEventListener("submit", function (event) {
  event.preventDefault();
  checkAnswer();
});

// only allow digits in the answer box, with a minus allowed at the front
answerBox.addEventListener("input", function () {
  var negative = /^\s*[-−]/.test(answerBox.value);
  answerBox.value = (negative ? "-" : "") + answerBox.value.replace(/\D/g, "");
});

// number pad on the screen (phones) — and the keyboard uses this too
function pressKey(value) {
  var box = answerBox.value;

  if (value === "go") {
    checkAnswer();
  } else if (value === "del") {
    answerBox.value = box.slice(0, -1);
  } else if (value === "neg") {
    // − switches the minus sign at the front on and off
    answerBox.value = box.charAt(0) === "-" ? box.slice(1) : "-" + box;
  } else if (box.replace("-", "").length < 7) {
    answerBox.value = box + value;
  }
}

document.querySelectorAll(".key").forEach(function (key) {
  key.addEventListener("click", function () {
    pressKey(key.dataset.key);
  });
});

// KEYBOARD (computers): on your turn, the number keys type your answer,
// Backspace deletes, and Enter checks it (the same as pressing Go).
// Works with the top row of numbers and the number pad, even if you
// clicked somewhere else on the page first.
document.addEventListener("keydown", function (event) {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }

  // Esc pauses the game, and Esc again carries on
  if (event.key === "Escape" && gameRunning) {
    event.preventDefault();
    togglePause();
    return;
  }

  if (!isYourTurn()) {
    return;
  }

  var value = null;
  if (/^Numpad[0-9]$/.test(event.code)) {
    value = event.code.slice(-1); // number pad keys work even with Num Lock off
  } else if (/^[0-9]$/.test(event.key)) {
    value = event.key;
  } else if (event.key === "-" || event.code === "NumpadSubtract") {
    value = "neg"; // the minus key makes the answer negative
  } else if (event.key === "Backspace") {
    value = "del";
  } else if (event.key === "Enter") {
    value = "go";
  }
  if (value === null) {
    return;
  }

  // light up the matching key on the screen (.key.pressed in styles.css)
  var screenKey = document.querySelector('.key[data-key="' + value + '"]');
  if (screenKey) {
    screenKey.classList.add("pressed");
    setTimeout(function () { screenKey.classList.remove("pressed"); }, 150);
  }

  // typing straight into the answer box already works by itself,
  // except number pad keys when Num Lock is off (those are handled below)
  // (the minus key is always handled below, so it switches the sign on and off)
  var numLockOff = /^Numpad[0-9]$/.test(event.code) && !/^[0-9]$/.test(event.key);
  if (event.target === answerBox && !numLockOff && value !== "neg") {
    return;
  }

  event.preventDefault();
  pressKey(value);
});


// ----- Start -----
updateLabels();