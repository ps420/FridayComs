// FridayComs/VoiceHandler.cs
using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Linq;

namespace FridayComs
{
    public class VoiceHandler
    {
        private readonly string _azureKey;
        private readonly string _azureRegion;
        private readonly HttpClient _httpClient;
        private const string AzureSttUrl = "https://{0}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1";
        private const string AzureTtsUrl = "https://{0}.tts.speech.microsoft.com/cognitiveservices/v1";

        public VoiceHandler(string azureKey, string azureRegion = "southafricanorth")
        {
            _azureKey = azureKey;
            _azureRegion = azureRegion;
            _httpClient = new HttpClient();
            _httpClient.DefaultRequestHeaders.Add("Ocp-Apim-Subscription-Key", _azureKey);
        }

        public async Task<string> SpeechToTextAsync(byte[] audioData)
        {
            var url = string.Format(AzureSttUrl, _azureRegion) + "?language=en-US";
            var content = new ByteArrayContent(audioData);
            content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("audio/wav");
            var resp = await _httpClient.PostAsync(url, content);
            resp.EnsureSuccessStatusCode();
            var json = await resp.Content.ReadAsStringAsync();
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            return doc.RootElement.GetProperty("DisplayText").GetString();
        }

        public async Task<byte[]> TextToSpeechAsync(string text, string voice = "en-US-JennyNeural")
        {
            var ssml = $@"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis'><voice name='{voice}'>{text}</voice></speak>";
            var url = string.Format(AzureTtsUrl, _azureRegion);
            var content = new StringContent(ssml, Encoding.UTF8, "application/ssml+xml");
            content.Headers.Add("X-Microsoft-OutputFormat", "audio-24khz-96kbitrate-mono-mp3");
            var resp = await _httpClient.PostAsync(url, content);
            resp.EnsureSuccessStatusCode();
            return await resp.Content.ReadAsByteArrayAsync();
        }
    }
}