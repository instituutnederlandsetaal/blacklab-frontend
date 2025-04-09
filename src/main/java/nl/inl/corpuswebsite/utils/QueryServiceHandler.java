package nl.inl.corpuswebsite.utils;

import java.io.IOException;
import java.io.InputStream;
import java.io.UnsupportedEncodingException;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLEncoder;
import java.util.Map;
import java.util.Map.Entry;

import org.apache.commons.io.IOUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Contacts the webservice and returns the response.
 */
public class QueryServiceHandler {

    private static final Logger logger = LogManager.getLogger(QueryServiceHandler.class);

    public static class QueryException extends Exception {
        private final int httpStatusCode;
        private final String reason;

        public QueryException(int code, String reason) {
            this.httpStatusCode = code;
            this.reason = reason;
        }

        public int getHttpStatusCode() {
            return httpStatusCode;
        }

        public String getReason() {
            return reason;
        }
    }

    private String webserviceBaseUrl;

    public QueryServiceHandler(String url) {
        webserviceBaseUrl = url;
    }

    /**
     * Performs request to the webservice and returns the response.
     *
     * @param params parameters to send
     * @return the response
     * @throws IOException on generic read/write error
     * @throws QueryException on error http code
     */
    public String makeRequest(Map<String, String[]> params) throws IOException, QueryException {
        String requestUrl = makeQueryString(params);

        logger.debug("Request: {}", requestUrl);
        return fetchXml(requestUrl);
    }

    private static String fetchXml(String url) throws IOException, QueryException {
        int code = -1;
        String reason = null;
        try {
            URL urlObj = new URL(url);
            HttpURLConnection connection = (HttpURLConnection) urlObj.openConnection();
            try {
                connection.setRequestProperty("Accept", "application/xml");
                connection.setRequestMethod("GET");
                code = connection.getResponseCode();

                // Not an HTTP success (2xx) code or 401 Unauthorized?
                // (we use the 401 to test if we are allowed to view the document contents)
                if ((code < 200 || code > 299) && code != 401) {
                    reason = connection.getResponseMessage();
                    throw new QueryException(code, reason);
                }

                try (InputStream response = code == 401 ? connection.getErrorStream() : connection.getInputStream()) {
                    return StringUtils.join(IOUtils.readLines(response, "utf-8"), "\n");
                }
            } finally {
                connection.disconnect();
            }
        } catch (MalformedURLException e) {
            throw new IOException("Malformed URL", e);
        }
    }

    /**
     * Construct the GET url from the base URL and the parameter map
     *
     * @param params the parameters to send
     * @return the full GET url
     * @throws UnsupportedEncodingException
     */
    private String makeQueryString(Map<String, String[]> params) throws UnsupportedEncodingException {
        if (params == null)
            return webserviceBaseUrl;
        // make url parameter string
        StringBuilder builder = new StringBuilder();

        for (Entry<String, String[]> e : params.entrySet()) {
            for (String value : e.getValue()) {
                if (builder.length() > 0)
                    builder.append("&");
                builder.append(e.getKey());
                builder.append("=");
                builder.append(URLEncoder.encode(value, "UTF-8"));
            }
        }

        return webserviceBaseUrl + "?" + builder.toString();
    }
}
