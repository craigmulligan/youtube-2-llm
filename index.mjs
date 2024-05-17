import chalk from "chalk";
import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg-7";
import { SpeechClient } from "@google-cloud/speech";
import { Transform } from "stream";
import OpenAI from "openai";
const openai = new OpenAI({
  baseURL: "http://localhost:11434/v1/",
  // required but ignored
  apiKey: "ollama",
});

const model = "llama3";
// Path to the service account key file
const keyFilename = process.env.GOOGLE_CREDS;

// Create a client
const client = new SpeechClient({ keyFilename });

// YouTube live video URL
const videoUrl = "https://www.youtube.com/watch?v=hKxl-oukXmU";

// Create a transform stream to buffer audio chunks
class BufferStream extends Transform {
  _transform(chunk, encoding, callback) {
    this.push(chunk);
    callback();
  }
}

// Configure request for Google Speech-to-Text API
const request = {
  config: {
    encoding: "LINEAR16",
    sampleRateHertz: 16000,
    languageCode: "en-US",
  },
  interimResults: false, // If you want interim results, set this to true
};

// Stream the video and extract audio
const videoStream = ytdl(videoUrl, { quality: "highestaudio" });
const bufferStream = new BufferStream();

async function run() {
  await openai.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          "I am going to stream captions from a youtube video you are to respond very tersely with your understanding of the video so far",
      },
    ],
    model,
  });

  ffmpeg(videoStream)
    .audioCodec("pcm_s16le")
    .format("wav")
    .audioFrequency(16000)
    .on("error", (err) => {
      console.error("FFmpeg error:", err);
    })
    .pipe(bufferStream);

  // Create a recognize stream
  const recognizeStream = client
    .streamingRecognize(request)
    .on("error", (err) => {
      console.error("Speech-to-Text error:", err);
    })
    .on("data", async (data) => {
      if (data.results[0]) {
        const completion = await openai.chat.completions.create({
          messages: [
            {
              role: "user",
              content: data.results[0].alternatives[0].transcript,
            },
          ],
          model,
        });
        console.log(
          chalk.blue(
            data.results[0] && data.results[0].alternatives[0].transcript,
          ),
        );

        console.log(
          chalk.green(data.results[0] && completion.choices[0].message.content),
        );
      }
    });

  // Pipe audio data into the recognize stream
  bufferStream.pipe(recognizeStream);
}

run();
