<%@ WebHandler Language="C#" Class="Besog" %>

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web;

// Besøgstæller uden cookies.
//
// POST registrerer et besøg. IP-adressen bruges kun i hukommelsen til to ting:
//   1. at slå landet op i App_Data/geo.bin (DB-IP, ligger på serveren selv)
//   2. at genkende samme besøgende samme dag via en hash med et tilfældigt salt,
//      der skiftes hver dag og aldrig gemmes.
// Hverken IP-adresse eller hash skrives til disk – kun de samlede tal.
//
// GET returnerer de samlede tal som JSON til kortet på forsiden.
public class Besog : IHttpHandler
{
    static readonly object Laas = new object();
    static readonly Regex Bot = new Regex("bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|villadsclaes-landingpage", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly string[] TilladteVaerter = { "villadsclaes.dk", "www.villadsclaes.dk" };
    const int DageGemt = 120;

    static uint[] starter;
    static byte[] indeks;
    static string[] koder;

    static string saltDag;
    static byte[] salt;
    static readonly HashSet<string> setIDag = new HashSet<string>();

    static SortedDictionary<string, long> tal;

    public bool IsReusable { get { return true; } }

    public void ProcessRequest(HttpContext ctx)
    {
        HttpResponse res = ctx.Response;
        res.ContentType = "application/json";
        res.Cache.SetCacheability(HttpCacheability.NoCache);
        res.Cache.SetNoStore();
        res.AppendHeader("X-Robots-Tag", "noindex");

        try
        {
            lock (Laas)
            {
                IndlaesTal(ctx);
                if (ctx.Request.HttpMethod == "POST")
                {
                    Registrer(ctx);
                    res.StatusCode = 204;
                    return;
                }
                res.Write(Json());
            }
        }
        catch (Exception ex)
        {
            res.StatusCode = 500;
            res.Write("{\"fejl\":\"" + ex.GetType().Name + "\"}");
        }
    }

    // ---------- Registrering ----------
    static void Registrer(HttpContext ctx)
    {
        HttpRequest req = ctx.Request;
        string ua = req.UserAgent ?? "";
        if (ua.IndexOf("Mozilla", StringComparison.Ordinal) < 0 || Bot.IsMatch(ua)) return;

        // Kun besøg sendt fra forsiden selv tæller
        string origin = req.Headers["Origin"];
        Uri originUri;
        if (origin == null || !Uri.TryCreate(origin, UriKind.Absolute, out originUri)) return;
        if (!TilladteVaerter.Contains(originUri.Host.ToLowerInvariant())) return;

        string dag = DanskDato();
        if (saltDag != dag)
        {
            saltDag = dag;
            salt = new byte[32];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(salt);
            setIDag.Clear();
        }

        string ip = req.UserHostAddress ?? "";
        Plus("visninger");
        if (!setIDag.Add(Hash(ip + "|" + ua))) { GemTal(ctx); return; }

        string land = SlaaLandOp(ctx, ip);
        Plus("besogende");
        Plus("d:" + dag);
        Plus("c:" + land);
        GemTal(ctx);
    }

    static string Hash(string tekst)
    {
        using (var h = new HMACSHA256(salt))
            return Convert.ToBase64String(h.ComputeHash(Encoding.UTF8.GetBytes(tekst)));
    }

    static string DanskDato()
    {
        DateTime nu = DateTime.UtcNow;
        try { nu = TimeZoneInfo.ConvertTimeBySystemTimeZoneId(nu, "Romance Standard Time"); } catch { }
        return nu.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    // ---------- Landeopslag ----------
    static string SlaaLandOp(HttpContext ctx, string tekst)
    {
        IPAddress ip;
        if (!IPAddress.TryParse(tekst, out ip)) return "--";
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (ip.AddressFamily != AddressFamily.InterNetwork) return "--";

        IndlaesGeo(ctx);
        byte[] b = ip.GetAddressBytes();
        uint vaerdi = ((uint)b[0] << 24) | ((uint)b[1] << 16) | ((uint)b[2] << 8) | b[3];

        int lav = 0, hoj = starter.Length - 1, fundet = -1;
        while (lav <= hoj)
        {
            int midt = (lav + hoj) / 2;
            if (starter[midt] <= vaerdi) { fundet = midt; lav = midt + 1; }
            else hoj = midt - 1;
        }
        return fundet < 0 ? "--" : koder[indeks[fundet]];
    }

    static void IndlaesGeo(HttpContext ctx)
    {
        if (starter != null) return;
        byte[] data = File.ReadAllBytes(ctx.Server.MapPath("~/App_Data/geo.bin"));
        if (Encoding.ASCII.GetString(data, 0, 4) != "GEO1") throw new InvalidDataException("geo.bin");
        int o = 4;
        int n = BitConverter.ToInt32(data, o); o += 4;
        int k = data[o]; o += 1;
        var kodeListe = new string[k];
        for (int i = 0; i < k; i++) { kodeListe[i] = Encoding.ASCII.GetString(data, o, 2); o += 2; }
        var s = new uint[n];
        for (int i = 0; i < n; i++) { s[i] = BitConverter.ToUInt32(data, o); o += 4; }
        var idx = new byte[n];
        Buffer.BlockCopy(data, o, idx, 0, n);
        koder = kodeListe;
        indeks = idx;
        starter = s;
    }

    // ---------- Lagring af de samlede tal ----------
    static string Fil(HttpContext ctx) { return ctx.Server.MapPath("~/App_Data/besog.txt"); }

    static void IndlaesTal(HttpContext ctx)
    {
        if (tal != null) return;
        var t = new SortedDictionary<string, long>(StringComparer.Ordinal);
        string fil = Fil(ctx);
        if (File.Exists(fil))
        {
            foreach (string linje in File.ReadAllLines(fil))
            {
                string[] dele = linje.Split('\t');
                long v;
                if (dele.Length == 2 && long.TryParse(dele[1], out v)) t[dele[0]] = v;
            }
        }
        tal = t;
    }

    static void Plus(string noegle)
    {
        long v;
        tal.TryGetValue(noegle, out v);
        tal[noegle] = v + 1;
    }

    static void GemTal(HttpContext ctx)
    {
        if (!tal.ContainsKey("siden")) tal["siden"] = long.Parse(DanskDato().Replace("-", ""), CultureInfo.InvariantCulture);

        string graense = DateTime.UtcNow.AddDays(-DageGemt).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        foreach (string gammel in tal.Keys.Where(x => x.StartsWith("d:") && string.CompareOrdinal(x.Substring(2), graense) < 0).ToList())
            tal.Remove(gammel);

        var sb = new StringBuilder();
        foreach (var kv in tal) sb.Append(kv.Key).Append('\t').Append(kv.Value.ToString(CultureInfo.InvariantCulture)).Append('\n');
        string fil = Fil(ctx);
        string tmp = fil + ".tmp";
        File.WriteAllText(tmp, sb.ToString());
        if (File.Exists(fil)) File.Delete(fil);
        File.Move(tmp, fil);
    }

    // ---------- JSON ----------
    static string Json()
    {
        var sb = new StringBuilder();
        sb.Append("{\"besogende\":").Append(Hent("besogende"));
        sb.Append(",\"visninger\":").Append(Hent("visninger"));
        long siden = Hent("siden");
        sb.Append(",\"siden\":").Append(siden == 0 ? "null" : "\"" + siden.ToString(CultureInfo.InvariantCulture).Insert(6, "-").Insert(4, "-") + "\"");
        sb.Append(",\"idag\":").Append(Hent("d:" + DanskDato()));
        sb.Append(",\"lande\":{");
        AppendGruppe(sb, "c:");
        sb.Append("},\"dage\":{");
        AppendGruppe(sb, "d:");
        sb.Append("}}");
        return sb.ToString();
    }

    static long Hent(string noegle)
    {
        long v;
        return tal.TryGetValue(noegle, out v) ? v : 0;
    }

    static void AppendGruppe(StringBuilder sb, string praefiks)
    {
        bool foerste = true;
        foreach (var kv in tal)
        {
            if (!kv.Key.StartsWith(praefiks, StringComparison.Ordinal)) continue;
            if (!foerste) sb.Append(',');
            foerste = false;
            sb.Append('"').Append(kv.Key.Substring(praefiks.Length).Replace("\"", "")).Append("\":").Append(kv.Value.ToString(CultureInfo.InvariantCulture));
        }
    }
}
