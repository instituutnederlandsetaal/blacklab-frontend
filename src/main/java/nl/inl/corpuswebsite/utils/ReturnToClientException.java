package nl.inl.corpuswebsite.utils;

import jakarta.servlet.http.HttpServletResponse;

/** 
 * Should never be caught, only propagated to the top level, at which point the code and body should be returned to the client.
 * Yes yes.. Exceptions as control flow is bad practice, but in this case it makes perfect sense because we never know when we need abort/return control to the client. 
 * We only use this in unrecoverable situations (blacklab returned 404, 401, that sort of thing).
 */
public class ReturnToClientException extends RuntimeException {
	int code;
	String body;
	
	public ReturnToClientException(Exception e) {
		super(e);
		this.code = e instanceof QueryException ? ((QueryException) e).getHttpStatusCode() : HttpServletResponse.SC_INTERNAL_SERVER_ERROR;
		this.body = e.getMessage();
	}
	public ReturnToClientException(int code, String body) {
		super(body);
		this.code = code;
		this.body = body;
	}
	public ReturnToClientException(int code) {
		super();
		this.code = code;
	}

	public int getCode() {
		return code;
	}

	public String getBody() {
		return body;
	}
}
