let crossfadeDuration = 12;  // sec
var timer;
var timerSleepTight;
let indexAudioFiles = 1;
let musicId;
let fadeouttime = 60;  // seconds - target 30
let pitch=1.0;
let loading = false;
let version = "6";  // only used for cache-buston filepaths

// Files need to be longer than 60s (fadeouttime) for fadeout to work
// Field recording by me. Other files see comments below
let audioNames = [
  "Rosenlauibach",
  "Loud Gletscherschlucht Rosenlaui",
  "Quiet Gletscherschlucht Rosenlaui",
  "Lawine",
  "Freight train Hardbrücke",
  "Mare Di San Lorenzo Al Mare",
  "52 Blue",  // https://www.pmel.noaa.gov/acoustics/whales/sounds/sounds_52blue.html
]

let maxOfAudioFiles = audioNames.length;

async function play() {
  if(loading) {
    console.log("audio is already loading, abort")
    return
  }
  document.getElementById('audioName').innerHTML = `(loading: ${audioNames[indexAudioFiles-1]})`;
  loading = true;
  if(musicId) {
    console.log("Pause");
    GameAudio.stopSound(musicId, 1);
    musicId = null;
    document.getElementById('audioName').innerHTML = "paused";
    clearDeepSleep();
    swapIcon('pause');
    loading = false;
    return;
  }
  console.log("playing file @index ", indexAudioFiles);
  swapIcon('play');
  const { id, audioLength } = await GameAudio.playSound("static/audio/audio"+ indexAudioFiles+".mp3?v="+version, { loop: true, crossfade: 3, fadeIn: 1, fadeOut: 1, pitch: pitch });
  document.getElementById('audioName').innerHTML = `${audioNames[indexAudioFiles-1]}`;
  musicId = id;
  loading = false;
}

function setDeepSleep(mins) {
  console.log("Sleep timeout in ", mins, "mins");
  clearDeepSleep();
  timer =  setTimeout(() => {
    console.log("go to sleep now")
    setGuiTime("Fading out to nothingness until the sun consumes the earth.")
    ///GameAudio.stopSound(musicId, fadeouttime);
    GameAudio.stopAllSound("all", fadeouttime);
    timerSleepTight = setTimeout(() => {
      setGuiTime("Sleep tight.");
      swapIcon('pause');
    }, fadeouttime*1000);
  }, mins * 60 * 1000); // 30 minutes = 30 * 60 seconds * 1000 milliseconds.
  setGuiTime("Sleep at " + calcTime(mins));
}

function swapIcon(icon) {
  if(icon === 'pause') {
    console.log("change icon to pause")
    document.getElementById('play').classList.remove('pause');
  } else {
    console.log("change icon to play");
    document.getElementById('play').classList.add('pause');
  }
}

function clearDeepSleep() {
  if (timer) {
    clearTimeout(timer); // Clear the existing timer if it's already set
    clearTimeout(timerSleepTight); // Clear the existing timer if it's already set
  }
  setGuiTime("timeout");
}

function calcTime(offset) {
  var currentTime = new Date();
  var timeWillBe = new Date(currentTime.getTime() + offset * 60000); // Add 30 minutes (30 * 60 * 1000 milliseconds)
  var hours = timeWillBe.getHours();
  var minutes = timeWillBe.getMinutes();
  var formattedTime = (hours < 10 ? "0" + hours : hours) + ":" + (minutes < 10 ? "0" + minutes : minutes);
  return formattedTime;
}

function setGuiTime(time) {
  document.getElementById('timeEnds').innerHTML = time;
}

function changeAudio(dir) {
	indexAudioFiles += dir;
	indexAudioFiles = indexAudioFiles > maxOfAudioFiles ? 1 : indexAudioFiles;
	indexAudioFiles = indexAudioFiles <= 0 ? maxOfAudioFiles : indexAudioFiles;
  console.log(indexAudioFiles);
  if(musicId) {
    GameAudio.stopSound(musicId, 1);
    musicId = null;
  }
  play();
}

function setPitch(pitchDelta) {
	pitch += pitchDelta;
	pitch = pitch > 4 ? 4 : pitch;
	pitch = pitch <= -4 ? -4 : pitch;
  console.log(pitch);
  document.getElementById('pitch').innerHTML = `speed ${parseInt(pitch*100)}%`;
  if(musicId) {
    GameAudio.stopSound(musicId, 1);
    musicId = null;
  }
  play();
}

function hide(id) {
	for(i=0; i< arguments.length; i++) { 
		document.getElementById(arguments[i]).style.display = 'none';
	}
}

function show(id) {
	for(i=0; i< arguments.length; i++) { 
		document.getElementById(arguments[i]).style.display = 'block';
	}
}

function toggle(id) {
  let element = document.getElementById(id);
  let display = window.getComputedStyle(element, null).display;
  if(display == "" || display == "none") {
    show(id);
  } else {
    hide(id);
  }
}

loadLocalStorage();

function loadLocalStorage() {
 /*  if(localStorage.getItem("factorio")) {
    items = JSON.parse(localStorage.getItem("factorio"));
    console.log("got newest!");
    items.forEach(function callback(value, index) {
      if(value) {
        console.log(`${index}: ${value}`);
        items[index]--; // because function add() adds one
        add(index+1);
        if(value > 1) document.getElementById("itemCounter-"+(index+1)).innerHTML = items[index];
      }
    });
    
  } else {
    console.log("was nothing");
  }

  if(localStorage.getItem("factorio-goals")) {
    goals = JSON.parse(localStorage.getItem("factorio-goals"));
    console.log(goals);
    for (const [key, value] of Object.entries(goals)) {
      console.log(`${key}: ${value}`);
      addToTheList(key, value)
    }
  } */
}

function saveLocalStorageItem(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}
function clearLocalStorage() {
  localStorage.clear();
}
function clearLocalStorageItem(key) {
  if(key) localStorage.removeItem(key);
}