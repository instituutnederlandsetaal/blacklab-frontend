package nl.inl.corpuswebsite.utils;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Optional;
import java.util.stream.Collectors;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/** Factory pattern url builder */
class URLBuilder<T extends URLBuilder<T>> {
    protected String url;
    protected Map<String, String> headers;
    protected Map<String, String> cookies;
    protected Map<String, String[]> query;

    protected String hash;
    protected String method = "GET";

    public URLBuilder() {};

    /** Base url is used as-is (though query and hash are removed), pathParts are escaped and joined using '/' */
    public URLBuilder(String base, String... paths) {
        if (base != null) url(base, paths);
    }

    public T method(String method) {
        this.method = method;
        return (T) this;
    }

    public T url(String base, String... paths) {
        if (base.contains("#")) {
            String[] parts = base.split("#");
            base = parts[0];
            hash(parts[1]);
        }

        if (base.contains("?")) {
            String[] parts = base.split("\\?");
            base = parts[0];
            query(parts[1]);
        }

        StringBuilder b = new StringBuilder(base);
        for (String s: paths) {
            // append a slash if the url does not end with one
            if (b.length() > 0 && b.charAt(b.length() - 1) != '/')
                b.append('/');
            b.append(URLEncoder.encode(s, StandardCharsets.UTF_8));
        }
        this.url = b.toString();
        return (T) this;
    }


    /**
     * Set a query parameter, overwriting any existing value for the key.
     * @param key unescaped key
     * @param value unescaped value(s)
     * @return this
     */
    public T query(String key, String... value) {
        if (query == null) {
            query = new HashMap<>();
        }
        query.put(key, value);
        return (T) this;
    }

    public T query(String key, Optional<String> value) {
        value.ifPresent(s -> query(key, s));
        return (T) this;
    }

    /**
     * Set the query from a string, overwriting any existing value for the keys.
     * @param q url-escaped query string. May contain multiple values for the same key.
     * @return this
     */
    public T query(String q) {
        Arrays.stream(q.replace("?", "").split("&"))
                .map(s -> s.split("=")) // split key=value
                .map(s -> Arrays.stream(s).map(v -> URLDecoder.decode(v, StandardCharsets.UTF_8)).collect(Collectors.toList())) // decode key and value
                .collect(Collectors.groupingBy(s -> s.get(0), Collectors.mapping(s -> s.get(1), Collectors.toList()))) // group values by key
                .forEach((k, v) -> query(k, v.toArray(new String[0]))); // for each key value(s) pair, set the query
        return (T) this;
    }

    /**
     * @param hash The unescaped url hash
     */
    public T hash(String hash) {
        this.hash = hash;
        return (T) this;
    }

    /**
     * Set a header, overwriting any existing value for the key.
     * @param key the unescaped key
     * @param value the unescaped value
     * @return this
     */
    public T header(String key, String value) {
        if (headers == null) {
            headers = new HashMap<>();
        }
        headers.put(key, value);
        return (T) this;
    }

    /**
     * Set the headers from a map, overwriting any existing value for the keys.
     * @param headers the unescaped headers
     * @return this
     */
    public T headers(Map<String, String> headers) {
        if (this.headers == null) {
            this.headers = new HashMap<>();
        }
        this.headers.putAll(headers);
        return (T) this;
    }

    public T cookie(String key, String value) {
        if (cookies == null) {
            cookies = new HashMap<>();
        }
        cookies.put(key, value);
        return (T) this;
    }

    public T cookies(Map<String, String> cookies) {
        if (this.cookies == null) {
            this.cookies = new HashMap<>();
        }
        this.cookies.putAll(cookies);
        return (T) this;
    }

    public String getUrl() {
        return getUrl(url, query, hash);
    }

    public static String getUrl(String url, Map<String, String[]> query, String hash) {
        StringBuilder builder = new StringBuilder();
        if (query != null) {
            for (Entry<String, String[]> e : query.entrySet()) {
                for (String value : e.getValue()) {
                    if (builder.length() > 0)
                        builder.append("&");
                    builder.append(URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8));
                    builder.append("=");
                    builder.append(URLEncoder.encode(value, StandardCharsets.UTF_8));
                }
            }
        }
        return url
                + (builder.length() > 0 ? "?" + builder.toString() : "")
                + (hash != null ? "#" + URLEncoder.encode(hash, StandardCharsets.UTF_8) : "");
    }

    public HttpURLConnection connect() throws QueryException {
        try {
            URL urlObj = new URL(getUrl());
            HttpURLConnection connection = (HttpURLConnection) urlObj.openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setRequestMethod(method);

            if (headers != null) {
                for (Entry<String, String> header: headers.entrySet()) {
                    connection.addRequestProperty(header.getKey(), header.getValue());
                }
                if (cookies != null) {
                    connection.addRequestProperty("Cookie", cookies.entrySet().stream().map(c -> c.getKey() + "=" + c.getValue()).collect(Collectors.joining(";")));
                }
            }

            connection.connect();
            return connection;
        } catch (IOException e) {
            throw QueryException.wrap(e, "Error connecting to url " + url);
        }
    }
}

/** 
 * Make a request to url, passing the provided query and headers.
 * The request should copy the http authorization header from the provided request.
 *
 * Has some special logic for basic auth.
 * When the response to the request we're trying to make here indicates basic auth is required, and the passed in request (from our client)
 * doesn't contain basic auth, the response is modified to add the www-authorization header prior to throwing a ReturnToClientException that will return the 401 to the client.
 * Then the client's browser will prompt for credentials, and the request will be retried with the credentials.
 * After this our request should succeed, and the client will be able to access the resource.
 *
 * For more advanced authentication methods, no special logic exists, no ReturnToClientException is thrown, and the 401/403 is simply returned to the caller.
 */
public class AuthRequest extends URLBuilder<AuthRequest> {
    /** May be null */
    private final HttpServletRequest request;
    /** May be null. */
    private final HttpServletResponse response;

    private String method = "GET";

    /** Standard request without authentication support. We don't need the config if we're not going to communicate to the client. */
    public AuthRequest(String url) {
        super(url);
        this.request = null;
        this.response = null;
    }

    public AuthRequest(HttpServletRequest request, HttpServletResponse response) {
        super();
        this.request = request;
        this.response = response;
    }

    public AuthRequest(HttpServletRequest request, HttpServletResponse response, String url) {
        super(url);
        this.request = request;
        this.response = response;
    }

    public AuthRequest method(String method) {
        this.method = method;
        return this;
    }

    /**
     * Return the response from the url.
     * If the response is in the 200 range, the content is returned.
     * If the response is in the 300 range, the request is followed.
     * If the response is 401, the request is retried with the authorization header from the request (if present and the bearer type matches).
     * In all other cases the error is returned (including 404).
     *
     * A 401 might still be returned if the content is restricted for another reason rather than missing auth (or when invalid authentication is supplied).
     *
     * @param hardFailOnMissingAuth iff true and the upstream returns a 401 not authorized, it will be forwarded as-is to the client. If false, a regular 401 QueryException will be returned in the Result.
     *
     * @throws ReturnToClientException when authentication is required but not provided. The response is modified to add the www-authorization header prior to throwing.
     */
    public Result<String, QueryException> request(boolean hardFailOnMissingAuth) {
        try {
            HttpURLConnection r = connect();
            int redirects = 0;
            while (redirects < 10) {
                int code = r.getResponseCode();
                if (code == -1)
                    return Result.error(new QueryException(-1, "Unexpected response from url " + url));

                // redirect is not followed into other protocol ex. http to https
                // see https://stackoverflow.com/a/1884427
                if (code >= 300 && code < 400) {
                    String newUrl = r.getHeaderField("location");
                    if (newUrl != null && !newUrl.isEmpty()) {
                        r = new URLBuilder<>(newUrl) // should already contain query and hash
                                .method(this.method)
                                .headers(this.headers)
                                .cookies(this.cookies)
                                .connect();
                        ++redirects;
                        continue;
                    }
                }

                // in all cases this request is performed on behalf of a user's request to this application
                // therefor, if this request fails because of missing authentication, we should forward the request for authentication to the client.
                // if there is a www-authenticate header, we should forward it to the user
                if (hardFailOnMissingAuth && r.getHeaderField("www-authenticate") != null) {
                    r.getHeaderFields().forEach((k, v) -> v.forEach(w -> response.addHeader(k, w)));
                    InputStream s = r.getErrorStream() != null ? r.getErrorStream() : r.getInputStream();
                    String content = new BufferedReader(new InputStreamReader(s, StandardCharsets.UTF_8)).lines().collect(Collectors.joining("\n"));
                    throw new ReturnToClientException(code, content);
                }

                return decode(r);
            }
            return Result.error(new QueryException(HttpServletResponse.SC_BAD_GATEWAY, "Too many redirects"));
        } catch (IOException | QueryException e) {
            return Result.error(QueryException.wrap(e));
        }
    }

    /**
     * Decode the result (or error), returning the contents in the String if it's a success.
     * Returns a queryException containing the httpcode and body if it's an error.
     * If an ioerror occurs, it's wrapped in a queryexception with code 500.
     *
     * @param conn the connection holding the response.
     *
     * @return the result of the above.
     */
    protected static Result<String, QueryException> decode(HttpURLConnection conn) {
        try {
            int code = conn.getResponseCode();
            if (conn.getErrorStream() != null) {
                String body = new BufferedReader(new InputStreamReader(conn.getErrorStream(), StandardCharsets.UTF_8)).lines().collect(Collectors.joining("\n"));
                return Result.error(new QueryException(code, body));
            } else if (code < 200 || code >= 300) {
                return Result.error(new QueryException(code, "Unexpected response (http " + code + ") from url " + conn.getURL()));
            } else if (code == 204) {
                return Result.success("");
            } else {
                String body = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)).lines().collect(Collectors.joining("\n"));
                return Result.success(body);
            }
        } catch (IOException e) {
            return Result.error(QueryException.wrap(e));
        }
    }
}