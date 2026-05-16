using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace FridayComs
{
    public sealed class WhatsAppControlClient
    {
        private readonly HttpClient _httpClient;
        private readonly JsonSerializerOptions _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        public WhatsAppControlClient(string baseUrl)
        {
            _httpClient = new HttpClient { BaseAddress = new Uri(baseUrl.TrimEnd('/')) };
        }

        public Task<HttpResponseMessage> GetAsync(string path)
            => _httpClient.GetAsync(path);

        public Task<HttpResponseMessage> PostAsync(string path, object payload)
        {
            var json = JsonSerializer.Serialize(payload, _jsonOptions);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            return _httpClient.PostAsync(path, content);
        }
    }
}
