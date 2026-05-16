// FridayComs/GatewayClient.cs
using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace FridayComs
{
    public class GatewayClient
    {
        private readonly HttpClient _httpClient;
        private readonly string _gatewayUrl;
        private readonly string _token;

        public GatewayClient(string gatewayUrl, string token)
        {
            _gatewayUrl = gatewayUrl.TrimEnd('/');
            _token = token;
            _httpClient = new HttpClient();
            _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_token}");
        }

        public async Task<string> SendMessageAsync(string sessionKey, string message)
        {
            var payload = new
            {
                sessionKey = sessionKey,
                message = message
            };
            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var resp = await _httpClient.PostAsync($"{_gatewayUrl}/api/v1/sessions/{sessionKey}/send", content);
            resp.EnsureSuccessStatusCode();
            return await resp.Content.ReadAsStringAsync();
        }

        public async Task<string> PollMessagesAsync(string sessionKey, string lastMessageId = null)
        {
            var url = $"{_gatewayUrl}/api/v1/sessions/{sessionKey}/messages?limit=10";
            if (!string.IsNullOrEmpty(lastMessageId))
                url += $"&after={lastMessageId}";
            var resp = await _httpClient.GetAsync(url);
            resp.EnsureSuccessStatusCode();
            return await resp.Content.ReadAsStringAsync();
        }
    }
}
