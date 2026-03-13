package nl.inl.corpuswebsite.utils;

/** 
 * Should never be caught, only propagated to the top level, at which point the code and body should be returned to the client.
 * Yes yes.. Exceptions as control flow is bad practice, but in this case it makes perfect sense because we never know when we need abort/return control to the client. 
 * We only use this in unrecoverable situations (blacklab returned 404, 401, that sort of thing).
 */
public class ReturnToClientException extends HttpException {
	private ReturnToClientException(Exception e) {
		super(e);
	}
	public ReturnToClientException(int code, String body) {
		super(code, body);
	}
	public ReturnToClientException(String body) {
		super(body);
	}
	public ReturnToClientException(int code) {
		super(code);
	}

	public static ReturnToClientException wrap(Exception e) {
		if (e instanceof ReturnToClientException) return (ReturnToClientException) e;
		else return new ReturnToClientException(e);
	}
}
