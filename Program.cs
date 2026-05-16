using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace FridayComs
{
    public class Program
    {
        public static async Task<int> Main(string[] args)
        {
            var config = AppConfig.Load(args);
            var client = new WhatsAppControlClient(config.BaseUrl);

            try
            {
                switch (config.Command)
                {
                    case "health":
                        return await PrintJson(await client.GetAsync("/health"));
                    case "status":
                        return await PrintJson(await client.GetAsync("/whatsapp/status"));
                    case "screenshot":
                        return await PrintJson(await client.GetAsync("/whatsapp/screenshot"));
                    case "active-chat":
                        return await PrintJson(await client.GetAsync("/whatsapp/active-chat"));
                    case "set-active-chat":
                        return await PrintJson(await client.PostAsync("/whatsapp/set-active-chat", new { target = config.Target }));
                    case "send-message":
                        return await PrintJson(await client.PostAsync("/whatsapp/send-message", new { target = config.Target, message = config.Message }));
                    case "send-image":
                        return await PrintJson(await client.PostAsync("/whatsapp/send-image", new { target = config.Target, image_path = config.ImagePath, caption = config.Caption }));
                    case "start-call":
                        return await PrintJson(await client.PostAsync("/whatsapp/start-call", new { target = config.Target, approved = config.Approved }));
                    case "end-call":
                        return await PrintJson(await client.PostAsync("/whatsapp/end-call", new { }));
                    case "help":
                    default:
                        PrintHelp();
                        return config.Command == "help" ? 0 : 1;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(ex.Message);
                return 1;
            }
        }

        private static async Task<int> PrintJson(HttpResponseMessage response)
        {
            var body = await response.Content.ReadAsStringAsync();
            Console.WriteLine(body);
            return response.IsSuccessStatusCode ? 0 : 1;
        }

        private static void PrintHelp()
        {
            Console.WriteLine("FridayComs CLI");
            Console.WriteLine("  --base-url http://127.0.0.1:8766");
            Console.WriteLine("Commands:");
            Console.WriteLine("  health");
            Console.WriteLine("  status");
            Console.WriteLine("  screenshot");
            Console.WriteLine("  active-chat");
            Console.WriteLine("  set-active-chat --target <name>");
            Console.WriteLine("  send-message --target <name> --message <text>");
            Console.WriteLine("  send-image --target <name> --image <linux-path> [--caption <text>]");
            Console.WriteLine("  start-call --target <name> --approved");
            Console.WriteLine("  end-call");
        }
    }

    internal sealed class AppConfig
    {
        public string BaseUrl { get; private set; } = "http://127.0.0.1:8766";
        public string Command { get; private set; } = "help";
        public string Target { get; private set; } = "D.O.T.";
        public string Message { get; private set; } = string.Empty;
        public string ImagePath { get; private set; } = string.Empty;
        public string Caption { get; private set; } = string.Empty;
        public bool Approved { get; private set; }

        public static AppConfig Load(string[] args)
        {
            var cfg = new AppConfig();
            var positionals = new List<string>();
            for (var i = 0; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "--base-url": cfg.BaseUrl = args[++i]; break;
                    case "--target": cfg.Target = args[++i]; break;
                    case "--message": cfg.Message = args[++i]; break;
                    case "--image": cfg.ImagePath = args[++i]; break;
                    case "--caption": cfg.Caption = args[++i]; break;
                    case "--approved": cfg.Approved = true; break;
                    default: positionals.Add(args[i]); break;
                }
            }
            if (positionals.Count > 0) cfg.Command = positionals[0].ToLowerInvariant();
            return cfg;
        }
    }
}
